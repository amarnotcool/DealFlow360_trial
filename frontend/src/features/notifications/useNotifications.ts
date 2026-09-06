// What is waiting for the signed-in user right now.
//
// There is no notification table and no socket feed behind this: the bell is a
// read across three lists the app already serves, filtered to the sections the
// signed-in role can actually act on (CLAUDE.md rule 6 — REST only).
//
//   pending approvals      GET /approvals                    manager / finance / admin
//   live deal-health alerts GET /alerts                      manager / finance / admin
//   quotations in negotiation GET /quotations?status=...     rep / manager / admin
//
// Nothing here mutates, so the bell never writes an audit row.

import { useCallback, useEffect, useState } from 'react';
import type {
  AlertView,
  ApprovalListItem,
  QuotationListItem,
  QuotationStatus,
  RoleCode,
} from '@dealflow360/shared';

import { fetchApprovals } from '../approvals/approvals.api';
import { fetchAlerts } from '../deal-health/deal-health.api';
import { fetchQuotations } from '../quotations/quotations.api';
import { APPROVALS_ROLES, NEGOTIATION_RESPOND_ROLES } from '../../routes/access';

export type NotificationKind = 'APPROVAL' | 'ALERT' | 'NEGOTIATION';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  /** Where clicking the row takes the user — the screen they act on it from. */
  to: string;
}

export interface NotificationSection {
  kind: NotificationKind;
  label: string;
  /** Where the section header links, so an over-long list still has a way out. */
  to: string;
  /** Everything waiting, including what the panel had to cut. */
  total: number;
  items: NotificationItem[];
}

export interface NotificationsState {
  /** Null until the first read lands, so the panel can say it is loading. */
  sections: NotificationSection[] | null;
  count: number;
  reload: () => Promise<void>;
}

/** Long lists are cut in the panel; the section header opens the full screen. */
const PER_SECTION = 5;

function approvalSection(rows: ApprovalListItem[]): NotificationSection {
  // Only the ones the desk still owes a decision on: a returned quotation is
  // back with its rep and is not waiting on anyone here.
  const waiting = rows.filter((row) => row.currentStep !== null);

  return {
    kind: 'APPROVAL',
    label: 'Pending approvals',
    to: '/approvals',
    total: waiting.length,
    items: waiting.slice(0, PER_SECTION).map((row) => ({
      id: row.id,
      kind: 'APPROVAL' as const,
      title: `${row.number} · ${row.customer.name}`,
      detail: `${row.currentStep ? row.currentStep.level.replace(/_/g, ' ').toLowerCase() : 'awaiting'} · risk ${row.riskScore} (${row.riskLevel.toLowerCase()})`,
      to: `/approvals/${row.id}`,
    })),
  };
}

function alertSection(rows: AlertView[]): NotificationSection {
  return {
    kind: 'ALERT',
    label: 'Deal health alerts',
    to: '/deal-health',
    total: rows.length,
    items: rows.slice(0, PER_SECTION).map((row) => ({
      id: row.id,
      kind: 'ALERT' as const,
      title: row.title,
      detail: row.quotation
        ? `${row.quotation.number} · ${row.quotation.customer.name}`
        : row.severity.toLowerCase(),
      // Acknowledging and escalating live on the board, so that is where the
      // row goes — not to the quotation, where neither action exists.
      to: '/deal-health',
    })),
  };
}

function negotiationSection(rows: QuotationListItem[]): NotificationSection {
  return {
    kind: 'NEGOTIATION',
    label: 'Customer negotiations',
    to: '/quotations',
    total: rows.length,
    items: rows.slice(0, PER_SECTION).map((row) => ({
      id: row.id,
      kind: 'NEGOTIATION' as const,
      title: `${row.number} · ${row.customer.name}`,
      detail: `waiting on a reply · ${row.riskLevel.toLowerCase()} risk`,
      to: `/quotations/${row.id}`,
    })),
  };
}

export function useNotifications(role: RoleCode | null, userId: string | null): NotificationsState {
  const [sections, setSections] = useState<NotificationSection[] | null>(null);

  const reload = useCallback(async () => {
    if (!role) {
      setSections(null);
      return;
    }

    const seesDesk = APPROVALS_ROLES.includes(role);
    const seesNegotiations = NEGOTIATION_RESPOND_ROLES.includes(role);

    const [approvals, alerts, negotiations] = await Promise.all([
      seesDesk ? fetchApprovals() : null,
      // Scoped to the signed-in user first. An alert is assigned to the
      // quotation's owner, so a manager or finance user who owns no quotations
      // is scoped down to nothing — in that case the whole live board is what
      // they are actually watching, so that is what the bell shows.
      seesDesk && userId ? fetchAlerts({ assignedUserId: userId }) : null,
      seesNegotiations ? fetchQuotations('NEGOTIATION' as QuotationStatus) : null,
    ]);

    let alertRows = alerts?.data ?? [];
    if (seesDesk && alertRows.length === 0) {
      const board = await fetchAlerts();
      alertRows = board.data ?? [];
    }

    const next: NotificationSection[] = [];
    if (seesDesk) next.push(approvalSection(approvals?.data ?? []));
    if (seesDesk) next.push(alertSection(alertRows));
    if (seesNegotiations) next.push(negotiationSection(negotiations?.data ?? []));

    setSections(next);
  }, [role, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const count = (sections ?? []).reduce((sum, section) => sum + section.total, 0);

  return { sections, count, reload };
}
