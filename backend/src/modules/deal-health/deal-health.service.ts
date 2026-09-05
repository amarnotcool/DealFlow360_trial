// Deal health: the three alerts specs.md §4 names, and the actions on them.
//
//   "Three alert types: stalled deals (idle more than a configured number of
//    days), discount anomalies (a discount well above that rep's historical
//    average), and delivery promise slippage."
//
// The detectors run on an explicit POST /alerts/scan, never on a timer: this
// is a REST-first codebase (CLAUDE.md rule 6) and a background job would be a
// second, invisible writer of the same rows.
//
// Scanning is idempotent by construction. One (subject, type) pair can hold at
// most one live alert — an alert that is OPEN, ACKNOWLEDGED or ESCALATED is
// still the same problem, so a re-scan finds it rather than filing it again.

import {
  AlertSeverity,
  AlertStatus,
  AlertType,
  AuditAction,
  FulfillmentStatus,
  Prisma,
  QuotationStatus,
} from '@prisma/client';
import type {
  AlertType as AlertTypeView,
  AlertSeverity as AlertSeverityView,
  AlertStatus as AlertStatusView,
  AlertListMeta,
  AlertMetadata,
  AlertScanResult,
  AlertView,
} from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../shared/audit/audit.service';
import type { ListQuery } from './deal-health.schemas';

// ---------------------------------------------------------------------------
// Thresholds
//
// These are the "configured number of days" and the "well above" of specs.md
// §4, pinned to named constants. They live here rather than in a settings
// table because a table would be a schema change for three numbers nobody has
// asked to edit at runtime.
// ---------------------------------------------------------------------------

/** A quotation that has not moved in this long is stalled. */
const STALLED_AFTER_DAYS = 14;

/** Twice the threshold, and the stall is the worst kind. */
const STALLED_HIGH_AFTER_DAYS = STALLED_AFTER_DAYS * 2;

/**
 * A discount is an anomaly when it clears BOTH tests against the rep's own
 * average: a fixed gap, so a rep who never discounts is not flagged for 3%,
 * and a multiple, so a rep who always discounts 20% is not flagged for 21%.
 */
const ANOMALY_POINTS_ABOVE_AVG = 10;
const ANOMALY_MULTIPLE_OF_AVG = 1.5;
const ANOMALY_HIGH_POINTS_ABOVE_AVG = 20;

/** Below this many prior quotes a rep has no average worth comparing against. */
const ANOMALY_MIN_HISTORY = 3;

/** A promise this many days past due is the worst kind of slippage. */
const SLIPPAGE_HIGH_AFTER_DAYS = 7;

/** The stages a quotation can still stall in — a finished quote cannot. */
const LIVE_QUOTATION_STATUSES: QuotationStatus[] = [
  QuotationStatus.DRAFT,
  QuotationStatus.PENDING_APPROVAL,
  QuotationStatus.APPROVED,
  QuotationStatus.NEGOTIATION,
];

/** An alert in any of these states is still the same open problem. */
const LIVE_ALERT_STATUSES: AlertStatus[] = [
  AlertStatus.OPEN,
  AlertStatus.ACKNOWLEDGED,
  AlertStatus.ESCALATED,
];

/** A shipment in any of these states can still be late. */
const UNSHIPPED_STATUSES: FulfillmentStatus[] = [
  FulfillmentStatus.PENDING,
  FulfillmentStatus.RESERVED,
  FulfillmentStatus.PICKED,
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const alertInclude = {
  quotation: {
    select: {
      id: true,
      number: true,
      status: true,
      totalAmount: true,
      customer: { select: { id: true, code: true, name: true } },
      ownerUser: { select: { id: true, fullName: true } },
    },
  },
  salesOrder: { select: { id: true, number: true, status: true } },
  acknowledgedByUser: { select: { id: true, fullName: true } },
} satisfies Prisma.AlertInclude;

type AlertRow = Prisma.AlertGetPayload<{ include: typeof alertInclude }>;

function toView(row: AlertRow): AlertView {
  return {
    id: row.id,
    // The shared enums and the Prisma enums hold the same members; the cast is
    // the boundary between the two, not a widening.
    type: row.type as AlertTypeView,
    severity: row.severity as AlertSeverityView,
    status: row.status as AlertStatusView,
    title: row.title,
    message: row.message,
    triggeredAt: row.triggeredAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    metadata: (row.metadata ?? {}) as AlertMetadata,
    quotation: row.quotation
      ? {
          id: row.quotation.id,
          number: row.quotation.number,
          status: row.quotation.status,
          totalAmount: row.quotation.totalAmount.toFixed(2),
          customer: row.quotation.customer,
          ownerUser: row.quotation.ownerUser,
        }
      : null,
    salesOrder: row.salesOrder,
    acknowledgedByUser: row.acknowledgedByUser,
  };
}

function emptyByType(): Record<AlertType, number> {
  return { STALLED_DEAL: 0, DISCOUNT_ANOMALY: 0, DELIVERY_SLIPPAGE: 0 };
}

function emptyByStatus(): Record<AlertStatus, number> {
  return { OPEN: 0, ACKNOWLEDGED: 0, ESCALATED: 0, RESOLVED: 0 };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listAlerts(
  query: ListQuery,
): Promise<{ rows: AlertView[]; meta: AlertListMeta }> {
  const where: Prisma.AlertWhereInput = {
    ...(query.status ? { status: query.status } : { status: { in: LIVE_ALERT_STATUSES } }),
    ...(query.type ? { type: query.type } : {}),
    ...(query.assignedUserId ? { assignedUserId: query.assignedUserId } : {}),
  };

  const [rows, total, byType, byStatus] = await Promise.all([
    prisma.alert.findMany({
      where,
      include: alertInclude,
      // Worst first, then newest: the desk reads top-down.
      orderBy: [{ severity: 'desc' }, { triggeredAt: 'desc' }],
      skip: query.skip,
      take: query.take,
    }),
    prisma.alert.count({ where }),
    prisma.alert.groupBy({ by: ['type'], where, _count: { _all: true } }),
    prisma.alert.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ]);

  const typeCounts = emptyByType();
  for (const row of byType) typeCounts[row.type] = row._count._all;

  const statusCounts = emptyByStatus();
  for (const row of byStatus) statusCounts[row.status] = row._count._all;

  return { rows: rows.map(toView), meta: { total, byType: typeCounts, byStatus: statusCounts } };
}

// ---------------------------------------------------------------------------
// Detectors
//
// Each one returns the alerts it would file. Nothing is written until the scan
// has checked whether that (subject, type) already has a live alert.
// ---------------------------------------------------------------------------

interface Candidate {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  quotationId: string;
  salesOrderId?: string | null;
  customerId: string;
  /** The rep who owns the work, so the desk can filter by assignee. */
  assignedUserId: string;
  metadata: AlertMetadata;
}

/** specs.md §4: "stalled deals (idle more than a configured number of days)". */
async function detectStalledDeals(now: Date): Promise<Candidate[]> {
  const cutoff = new Date(now.getTime() - STALLED_AFTER_DAYS * MS_PER_DAY);

  const quotations = await prisma.quotation.findMany({
    where: { status: { in: LIVE_QUOTATION_STATUSES }, lastActivityAt: { lt: cutoff } },
    select: {
      id: true,
      number: true,
      status: true,
      customerId: true,
      ownerUserId: true,
      lastActivityAt: true,
      customer: { select: { name: true } },
    },
  });

  return quotations.map((quotation) => {
    const idleDays = wholeDaysBetween(quotation.lastActivityAt, now);

    return {
      type: AlertType.STALLED_DEAL,
      severity: idleDays >= STALLED_HIGH_AFTER_DAYS ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
      title: `${quotation.number} has not moved in ${idleDays} days`,
      message:
        `${quotation.number} for ${quotation.customer.name} is still ` +
        `${quotation.status.toLowerCase().replace('_', ' ')} and has been idle for ${idleDays} days ` +
        `(threshold ${STALLED_AFTER_DAYS}).`,
      quotationId: quotation.id,
      customerId: quotation.customerId,
      assignedUserId: quotation.ownerUserId,
      metadata: { idleDays, stalledAfterDays: STALLED_AFTER_DAYS },
    };
  });
}

/** The weighted discount a quotation actually carries, as a percentage. */
function weightedDiscountPct(quotation: {
  subtotalAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
}): number {
  if (quotation.subtotalAmount.lessThanOrEqualTo(0)) return 0;
  return quotation.discountAmount.div(quotation.subtotalAmount).mul(100).toNumber();
}

/**
 * specs.md §4: "a discount well above that rep's historical average".
 *
 * "Well above" is two tests at once, so neither a rep who never discounts nor
 * one who always does is judged by the other's yardstick. A rep with fewer
 * than ANOMALY_MIN_HISTORY other quotes has no average to be above.
 */
async function detectDiscountAnomalies(): Promise<Candidate[]> {
  const quotations = await prisma.quotation.findMany({
    where: { subtotalAmount: { gt: 0 } },
    select: {
      id: true,
      number: true,
      customerId: true,
      ownerUserId: true,
      subtotalAmount: true,
      discountAmount: true,
      status: true,
      customer: { select: { name: true } },
      ownerUser: { select: { fullName: true } },
    },
  });

  const byRep = new Map<string, typeof quotations>();
  for (const quotation of quotations) {
    const list = byRep.get(quotation.ownerUserId) ?? [];
    list.push(quotation);
    byRep.set(quotation.ownerUserId, list);
  }

  const candidates: Candidate[] = [];

  for (const [, repQuotations] of byRep) {
    if (repQuotations.length <= ANOMALY_MIN_HISTORY) continue;

    for (const quotation of repQuotations) {
      // The rep's average excludes the quote being judged, so one very deep
      // discount cannot drag its own baseline up and hide itself.
      const others = repQuotations.filter((row) => row.id !== quotation.id);
      if (others.length < ANOMALY_MIN_HISTORY) continue;

      const average =
        others.reduce((sum, row) => sum + weightedDiscountPct(row), 0) / others.length;
      const discount = weightedDiscountPct(quotation);

      const clearsGap = discount >= average + ANOMALY_POINTS_ABOVE_AVG;
      const clearsMultiple = discount >= average * ANOMALY_MULTIPLE_OF_AVG;
      if (!clearsGap || !clearsMultiple) continue;

      const quoteDiscountPct = Number(discount.toFixed(2));
      const repAverageDiscountPct = Number(average.toFixed(2));

      candidates.push({
        type: AlertType.DISCOUNT_ANOMALY,
        severity:
          discount >= average + ANOMALY_HIGH_POINTS_ABOVE_AVG
            ? AlertSeverity.HIGH
            : AlertSeverity.MEDIUM,
        title: `${quotation.number} discounts ${quoteDiscountPct}% against a ${repAverageDiscountPct}% average`,
        message:
          `${quotation.ownerUser.fullName} discounted ${quotation.number} for ` +
          `${quotation.customer.name} by ${quoteDiscountPct}%, against their own average of ` +
          `${repAverageDiscountPct}% across ${others.length} other quotations.`,
        quotationId: quotation.id,
        customerId: quotation.customerId,
        assignedUserId: quotation.ownerUserId,
        metadata: {
          quoteDiscountPct,
          repAverageDiscountPct,
          repQuoteCount: others.length,
        },
      });
    }
  }

  return candidates;
}

/**
 * specs.md §4: "delivery promise slippage".
 *
 * One alert per order rather than per shipment: an order two shipments late is
 * one conversation with the customer, not two.
 */
async function detectDeliverySlippage(now: Date): Promise<Candidate[]> {
  const late = await prisma.fulfillment.findMany({
    where: {
      promisedDate: { lt: now },
      status: { in: UNSHIPPED_STATUSES },
    },
    select: {
      id: true,
      promisedDate: true,
      salesOrder: {
        select: {
          id: true,
          number: true,
          customerId: true,
          quotationId: true,
          quotation: { select: { ownerUserId: true } },
          customer: { select: { name: true } },
        },
      },
    },
  });

  const byOrder = new Map<string, typeof late>();
  for (const fulfillment of late) {
    const list = byOrder.get(fulfillment.salesOrder.id) ?? [];
    list.push(fulfillment);
    byOrder.set(fulfillment.salesOrder.id, list);
  }

  return [...byOrder.values()].map((shipments) => {
    const order = shipments[0]!.salesOrder;
    // The oldest promise is the one the customer is counting from.
    const promised = shipments
      .map((row) => row.promisedDate!)
      .reduce((earliest, date) => (date < earliest ? date : earliest));
    const daysLate = wholeDaysBetween(promised, now);

    return {
      type: AlertType.DELIVERY_SLIPPAGE,
      severity: daysLate >= SLIPPAGE_HIGH_AFTER_DAYS ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
      title: `${order.number} is ${daysLate} days past its promised date`,
      message:
        `${shipments.length} shipment(s) on ${order.number} for ${order.customer.name} were ` +
        `promised for ${promised.toISOString().slice(0, 10)} and have not shipped.`,
      quotationId: order.quotationId,
      salesOrderId: order.id,
      customerId: order.customerId,
      assignedUserId: order.quotation.ownerUserId,
      metadata: {
        daysLate,
        promisedDate: promised.toISOString(),
        fulfillmentIds: shipments.map((row) => row.id),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

/** The subject an alert is about, which is what makes a re-scan a no-op. */
function subjectOf(candidate: Candidate): string {
  return candidate.type === AlertType.DELIVERY_SLIPPAGE
    ? `order:${candidate.salesOrderId}`
    : `quotation:${candidate.quotationId}`;
}

export async function scanAlerts(actorUserId: string): Promise<AlertScanResult> {
  const now = new Date();

  const [stalled, anomalies, slippage] = await Promise.all([
    detectStalledDeals(now),
    detectDiscountAnomalies(),
    detectDeliverySlippage(now),
  ]);
  const candidates = [...stalled, ...anomalies, ...slippage];

  const byType: AlertScanResult['byType'] = {
    STALLED_DEAL: { created: 0, existing: 0 },
    DISCOUNT_ANOMALY: { created: 0, existing: 0 },
    DELIVERY_SLIPPAGE: { created: 0, existing: 0 },
  };

  const createdIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    // Everything already live, keyed the same way a candidate is.
    const live = await tx.alert.findMany({
      where: { status: { in: LIVE_ALERT_STATUSES } },
      select: { type: true, quotationId: true, salesOrderId: true },
    });

    const seen = new Set(
      live.map((row) =>
        row.type === AlertType.DELIVERY_SLIPPAGE
          ? `${row.type}|order:${row.salesOrderId}`
          : `${row.type}|quotation:${row.quotationId}`,
      ),
    );

    for (const candidate of candidates) {
      const key = `${candidate.type}|${subjectOf(candidate)}`;
      if (seen.has(key)) {
        byType[candidate.type].existing += 1;
        continue;
      }
      // Guards two candidates of the same subject inside one run, too.
      seen.add(key);

      const alert = await tx.alert.create({
        data: {
          type: candidate.type,
          severity: candidate.severity,
          status: AlertStatus.OPEN,
          title: candidate.title,
          message: candidate.message,
          quotationId: candidate.quotationId,
          salesOrderId: candidate.salesOrderId ?? null,
          customerId: candidate.customerId,
          assignedUserId: candidate.assignedUserId,
          metadata: JSON.parse(JSON.stringify(candidate.metadata)) as Prisma.InputJsonValue,
          triggeredAt: now,
        },
      });

      createdIds.push(alert.id);
      byType[candidate.type].created += 1;
    }

    const created = createdIds.length;
    if (created > 0) {
      await recordAudit(tx, {
        entityType: 'alert',
        entityId: createdIds[0]!,
        action: AuditAction.CREATE,
        userId: actorUserId,
        reason: `Deal health scan opened ${created} alert(s)`,
        changes: { alertIds: createdIds, byType },
      });
    }
  });

  const rows = await prisma.alert.findMany({
    where: { id: { in: createdIds } },
    include: alertInclude,
    orderBy: [{ severity: 'desc' }, { triggeredAt: 'desc' }],
  });

  return {
    created: createdIds.length,
    existing: candidates.length - createdIds.length,
    byType,
    alerts: rows.map(toView),
  };
}

// ---------------------------------------------------------------------------
// Actions (specs.md screen 14: Escalate / Nudge Rep)
// ---------------------------------------------------------------------------

async function loadAlert(id: string) {
  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert) throw new NotFoundError('Alert', id);
  return alert;
}

async function readAlert(id: string): Promise<AlertView> {
  const row = await prisma.alert.findUnique({ where: { id }, include: alertInclude });
  if (!row) throw new NotFoundError('Alert', id);
  return toView(row);
}

/** The desk has seen it and owns it. */
export async function acknowledgeAlert(id: string, actorUserId: string): Promise<AlertView> {
  const existing = await loadAlert(id);

  if (existing.status === AlertStatus.ACKNOWLEDGED) {
    throw new ConflictError('This alert has already been acknowledged');
  }
  if (existing.status === AlertStatus.RESOLVED) {
    throw new ConflictError('This alert is resolved and cannot be acknowledged');
  }

  const acknowledgedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.alert.update({
      where: { id },
      data: {
        status: AlertStatus.ACKNOWLEDGED,
        acknowledgedByUserId: actorUserId,
        acknowledgedAt,
      },
    });

    await recordAudit(tx, {
      entityType: 'alert',
      entityId: id,
      action: AuditAction.UPDATE,
      userId: actorUserId,
      reason: `Alert acknowledged: ${existing.title}`,
      changes: { status: { from: existing.status, to: AlertStatus.ACKNOWLEDGED } },
    });
  });

  return readAlert(id);
}

/**
 * Nudge and escalate are the same act on the record: the alert is raised to
 * ESCALATED with a note. Nothing is emailed — there is no messaging integration
 * in this system, and inventing one would be a demo prop rather than a feature.
 */
export async function escalateAlert(
  id: string,
  actorUserId: string,
  note: string | null,
): Promise<AlertView> {
  const existing = await loadAlert(id);

  if (existing.status === AlertStatus.RESOLVED) {
    throw new ConflictError('This alert is resolved and cannot be escalated');
  }
  if (existing.status === AlertStatus.ESCALATED) {
    throw new ConflictError('This alert has already been escalated');
  }

  await prisma.$transaction(async (tx) => {
    await tx.alert.update({ where: { id }, data: { status: AlertStatus.ESCALATED } });

    await recordAudit(tx, {
      entityType: 'alert',
      entityId: id,
      action: AuditAction.UPDATE,
      userId: actorUserId,
      reason: note ?? `Alert escalated to the rep: ${existing.title}`,
      changes: {
        status: { from: existing.status, to: AlertStatus.ESCALATED },
        assignedUserId: existing.assignedUserId,
      },
    });
  });

  return readAlert(id);
}
