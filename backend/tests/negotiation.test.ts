// Answering a customer's negotiation request (CLAUDE.md "Testing": a
// counter-discount that pushes terms past threshold re-enters approval).
//
// `respond()` is a service, not pure logic, so the database it writes through
// is stood up in memory here rather than against a live Postgres — the test
// then asserts the rows the service actually wrote.
//
// What is NOT faked is the decision itself. The stubbed `recomputeQuotation`
// runs the real `computeDiscountRisk` over the fixture's real ceilings, so
// whether a counter breaches, and which chain that earns, is the discount
// engine's own answer. Hand-picking a risk result here would test nothing.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NegotiationStatus, Prisma, QuotationStatus } from '@prisma/client';
import type { DiscountEngineResult } from '@dealflow360/shared';

import { computeDiscountRisk } from '../src/modules/discount-engine/discount-engine.service';
import { ConflictError, NotFoundError } from '../src/lib/errors';

// --- The fixture -----------------------------------------------------------
//
// One Gold customer, one hardware line. Gold caps at 15% and Hardware caps at
// 15%, so the line's applicable ceiling is 15% and it currently sits at 12% —
// inside the ceiling, so the quote is APPROVED and carries no chain.

const TIER_CEILING_PCT = 15;
const CATEGORY_CEILING_PCT = 15;

const QUOTATION_ID = 'q-1';
const LINE_ID = 'line-1';
const REQUEST_ID = 'req-1';
const ACTOR_ID = 'user-rep';

interface State {
  quotation: {
    id: string;
    number: string;
    status: QuotationStatus;
    riskScore: Prisma.Decimal;
    riskLevel: string;
    requiresApproval: boolean;
    submittedAt: Date | null;
    approvedAt: Date | null;
    lastActivityAt: Date | null;
  };
  line: { id: string; sequence: number; description: string | null; discountPct: Prisma.Decimal };
  request: {
    id: string;
    quotationId: string;
    quotationLineId: string | null;
    status: NegotiationStatus;
    comment: string | null;
    counterDiscountPct: Prisma.Decimal | null;
    requestedDeliveryDate: Date | null;
    createdAt: Date;
    respondedByUserId: string | null;
    respondedAt: Date | null;
    responseNote: string | null;
  };
  approvalSteps: Array<{ level: string; sequence: number }>;
  audits: Array<{ entityType: string; entityId: string; action: string; userId: string | null; reason: string | null; changes: unknown }>;
}

let state: State;

function freshState(overrides: { counterDiscountPct?: number | null; quotationStatus?: QuotationStatus; requestStatus?: NegotiationStatus; quotationLineId?: string | null } = {}): State {
  return {
    quotation: {
      id: QUOTATION_ID,
      number: 'Q-TEST-0001',
      status: overrides.quotationStatus ?? QuotationStatus.APPROVED,
      riskScore: new Prisma.Decimal('0.00'),
      riskLevel: 'NONE',
      requiresApproval: false,
      submittedAt: null,
      approvedAt: new Date('2026-01-01T00:00:00.000Z'),
      lastActivityAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    line: {
      id: LINE_ID,
      sequence: 1,
      description: 'Laptop Pro 14',
      discountPct: new Prisma.Decimal('12.00'),
    },
    request: {
      id: REQUEST_ID,
      quotationId: QUOTATION_ID,
      quotationLineId: overrides.quotationLineId === undefined ? LINE_ID : overrides.quotationLineId,
      status: overrides.requestStatus ?? NegotiationStatus.PENDING,
      comment: 'Can you do better on the laptops?',
      counterDiscountPct:
        overrides.counterDiscountPct === undefined || overrides.counterDiscountPct === null
          ? null
          : new Prisma.Decimal(overrides.counterDiscountPct.toFixed(2)),
      requestedDeliveryDate: null,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      respondedByUserId: null,
      respondedAt: null,
      responseNote: null,
    },
    approvalSteps: [],
    audits: [],
  };
}

// --- The database the service writes through -------------------------------

function requestRow() {
  return {
    ...state.request,
    quotationLine: {
      id: state.line.id,
      sequence: state.line.sequence,
      description: state.line.description,
      discountPct: state.line.discountPct,
      product: { id: 'p-1', sku: 'HW-LAPTOP-PRO-14', name: 'Laptop Pro 14' },
    },
    customerContact: { id: 'c-1', fullName: 'Ishan Buyer', email: 'ishan@initech.test' },
    respondedByUser: state.request.respondedByUserId
      ? { id: state.request.respondedByUserId, fullName: 'Riya Sales Rep' }
      : null,
  };
}

const tx = {
  negotiationRequest: {
    findUnique: async () => ({
      ...state.request,
      quotation: {
        id: state.quotation.id,
        number: state.quotation.number,
        status: state.quotation.status,
      },
    }),
    findUniqueOrThrow: async () => requestRow(),
    update: async ({ data }: { data: Partial<State['request']> }) => {
      state.request = { ...state.request, ...data };
      return state.request;
    },
  },
  quotationLine: {
    update: async ({ data }: { data: { discountPct: Prisma.Decimal } }) => {
      state.line = { ...state.line, ...data };
      return state.line;
    },
  },
  quotation: {
    findUniqueOrThrow: async () => state.quotation,
    update: async ({ data }: { data: Partial<State['quotation']> }) => {
      state.quotation = { ...state.quotation, ...data };
      return state.quotation;
    },
  },
  auditLog: {
    create: async ({ data }: { data: State['audits'][number] }) => {
      state.audits.push(data);
      return data;
    },
  },
};

vi.mock('../src/lib/prisma-client', () => ({
  prisma: {
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    negotiationRequest: { findUniqueOrThrow: async () => requestRow() },
    quotation: { findUniqueOrThrow: async () => state.quotation },
  },
}));

// The engine is real; only the row-reading around it is stood in for.
vi.mock('../src/modules/quotations/quotations.service', () => ({
  recomputeQuotation: async (): Promise<DiscountEngineResult> => {
    const risk = computeDiscountRisk({
      lines: [
        {
          lineId: LINE_ID,
          categoryId: 'hardware',
          tierCeilingPct: TIER_CEILING_PCT,
          categoryCeilingPct: CATEGORY_CEILING_PCT,
          discountPct: state.line.discountPct.toNumber(),
        },
      ],
    });

    // recomputeQuotation stamps the score it just worked out onto the quote.
    state.quotation.riskScore = new Prisma.Decimal(risk.blendedScore.toFixed(2));
    state.quotation.riskLevel = risk.riskLevel;
    return risk;
  },
  rebuildApprovalChain: async (_client: unknown, _quotationId: string, risk: DiscountEngineResult) => {
    state.approvalSteps = risk.requiredApprovalChain.map((step) => ({
      level: step.level,
      sequence: step.sequence,
    }));
    return state.approvalSteps.map((step) => step.level);
  },
}));

const { respond } = await import('../src/modules/negotiation/negotiation.service');

function auditsFor(entityType: string) {
  return state.audits.filter((entry) => entry.entityType === entityType);
}

describe('respond', () => {
  beforeEach(() => {
    state = freshState({ counterDiscountPct: 14 });
  });

  it('prices an accepted counter that stays inside the ceiling, without re-approval', async () => {
    // 14% against a 15% ceiling: no overage, so the engine asks for no chain.
    const result = await respond(REQUEST_ID, ACTOR_ID, { decision: 'ACCEPT', responseNote: 'Agreed.' });

    expect(result.outcome).toBe('ACCEPTED');
    expect(result.appliedDiscountPct).toBe('14.00');
    expect(result.approvalChain).toEqual([]);

    // The agreed rate is the line's real rate — not a note beside it.
    expect(state.line.discountPct.toFixed(2)).toBe('14.00');
    expect(state.request.status).toBe(NegotiationStatus.ACCEPTED);
    expect(state.request.respondedByUserId).toBe(ACTOR_ID);
    expect(state.request.respondedAt).toBeInstanceOf(Date);
    expect(state.request.responseNote).toBe('Agreed.');

    // Nothing routed: the quote keeps the status it already had.
    expect(state.quotation.status).toBe(QuotationStatus.APPROVED);
    expect(state.quotation.requiresApproval).toBe(false);
    expect(state.approvalSteps).toEqual([]);
    expect(state.quotation.riskScore.toFixed(2)).toBe('0.00');

    expect(auditsFor('quotation_line')).toHaveLength(1);
    expect(auditsFor('negotiation_request')).toHaveLength(1);
  });

  it('re-enters approval when the accepted counter breaks the ceiling', async () => {
    // 25% against a 15% ceiling: 10 points over, which the engine scores HIGH.
    state = freshState({ counterDiscountPct: 25 });

    const result = await respond(REQUEST_ID, ACTOR_ID, { decision: 'ACCEPT', responseNote: null });

    expect(result.outcome).toBe('RE_APPROVAL');
    expect(result.appliedDiscountPct).toBe('25.00');
    // Agreeing on the phone cannot approve a discount: Finance is still in it.
    expect(result.approvalChain).toEqual(['SALES_MANAGER', 'FINANCE']);

    expect(state.line.discountPct.toFixed(2)).toBe('25.00');
    expect(state.request.status).toBe(NegotiationStatus.ACCEPTED);

    expect(state.quotation.status).toBe(QuotationStatus.PENDING_APPROVAL);
    expect(state.quotation.requiresApproval).toBe(true);
    expect(state.quotation.approvedAt).toBeNull();
    expect(state.quotation.submittedAt).toBeInstanceOf(Date);
    expect(state.quotation.riskScore.toFixed(2)).toBe('10.00');
    expect(state.quotation.riskLevel).toBe('HIGH');

    expect(state.approvalSteps).toEqual([
      { level: 'SALES_MANAGER', sequence: 1 },
      { level: 'FINANCE', sequence: 2 },
    ]);

    // The re-entry is on the record, with the score that caused it.
    const quotationAudit = auditsFor('quotation');
    expect(quotationAudit).toHaveLength(1);
    expect(quotationAudit[0]?.changes).toMatchObject({ blendedScore: 10, riskLevel: 'HIGH' });
  });

  it('routes a small breach to the sales manager alone', async () => {
    // 18% against a 15% ceiling: 3 points over, under the high-risk threshold.
    state = freshState({ counterDiscountPct: 18 });

    const result = await respond(REQUEST_ID, ACTOR_ID, { decision: 'ACCEPT', responseNote: null });

    expect(result.outcome).toBe('RE_APPROVAL');
    expect(result.approvalChain).toEqual(['SALES_MANAGER']);
    expect(state.quotation.riskScore.toFixed(2)).toBe('3.00');
    expect(state.quotation.riskLevel).toBe('MEDIUM');
  });

  it('leaves the line alone when the counter is rejected', async () => {
    state = freshState({ counterDiscountPct: 25 });

    const result = await respond(REQUEST_ID, ACTOR_ID, {
      decision: 'REJECT',
      responseNote: 'We cannot go past 15% on hardware.',
    });

    expect(result.outcome).toBe('REJECTED');
    expect(result.appliedDiscountPct).toBeNull();
    expect(result.approvalChain).toEqual([]);

    // The rate the customer asked for never touched the quote.
    expect(state.line.discountPct.toFixed(2)).toBe('12.00');
    expect(state.quotation.status).toBe(QuotationStatus.APPROVED);
    expect(state.quotation.requiresApproval).toBe(false);
    expect(state.approvalSteps).toEqual([]);

    expect(state.request.status).toBe(NegotiationStatus.REJECTED);
    expect(state.request.responseNote).toBe('We cannot go past 15% on hardware.');

    // A rejection prices nothing, so there is no line audit — only the answer.
    expect(auditsFor('quotation_line')).toHaveLength(0);
    expect(auditsFor('negotiation_request')).toHaveLength(1);
  });

  it('answers a request that carries no counter in words alone', async () => {
    // A delivery-date question or a plain comment: accepted, but nothing to price.
    state = freshState({ counterDiscountPct: null });

    const result = await respond(REQUEST_ID, ACTOR_ID, { decision: 'ACCEPT', responseNote: 'Noted.' });

    expect(result.outcome).toBe('ACCEPTED');
    expect(result.appliedDiscountPct).toBeNull();
    expect(state.line.discountPct.toFixed(2)).toBe('12.00');
    expect(auditsFor('quotation_line')).toHaveLength(0);
  });

  it('refuses a request two people answer at once', async () => {
    state = freshState({ counterDiscountPct: 14 });

    // The first answer lands.
    await respond(REQUEST_ID, ACTOR_ID, { decision: 'ACCEPT', responseNote: null });
    expect(state.request.status).toBe(NegotiationStatus.ACCEPTED);

    const lineBefore = state.line.discountPct.toFixed(2);
    const auditsBefore = state.audits.length;

    // The second desk was reading the same PENDING row a moment ago.
    await expect(
      respond(REQUEST_ID, 'user-manager', { decision: 'REJECT', responseNote: 'Too steep.' }),
    ).rejects.toBeInstanceOf(ConflictError);

    // The loser's answer changed nothing: no second price, no second audit.
    expect(state.line.discountPct.toFixed(2)).toBe(lineBefore);
    expect(state.request.respondedByUserId).toBe(ACTOR_ID);
    expect(state.request.responseNote).toBeNull();
    expect(state.audits).toHaveLength(auditsBefore);
  });

  it('refuses to answer a request on a quotation that is past negotiation', async () => {
    state = freshState({ counterDiscountPct: 14, quotationStatus: QuotationStatus.CONFIRMED });

    await expect(
      respond(REQUEST_ID, ACTOR_ID, { decision: 'ACCEPT', responseNote: null }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(state.line.discountPct.toFixed(2)).toBe('12.00');
    expect(state.request.status).toBe(NegotiationStatus.PENDING);
    expect(state.audits).toHaveLength(0);
  });

  it('reports a request that does not exist as missing, not as a conflict', async () => {
    const missing = await import('../src/modules/negotiation/negotiation.service');
    const original = tx.negotiationRequest.findUnique;
    tx.negotiationRequest.findUnique = (async () => null) as typeof original;

    await expect(
      missing.respond('req-gone', ACTOR_ID, { decision: 'ACCEPT', responseNote: null }),
    ).rejects.toBeInstanceOf(NotFoundError);

    tx.negotiationRequest.findUnique = original;
  });
});
