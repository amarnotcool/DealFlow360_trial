// Mirrors the Prisma enums of the same name in backend/prisma/schema.prisma.

export enum QuotationStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  NEGOTIATION = 'NEGOTIATION',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum LineType {
  ONE_TIME = 'ONE_TIME',
  RECURRING = 'RECURRING',
}

// ---------------------------------------------------------------------------
// Wire shapes for the quotations API.
// Decimal columns arrive as strings, since JSON has no decimal type; keep them
// as strings and render them, never parse them into floats for display.
// ---------------------------------------------------------------------------

import type { RiskLevel } from './risk-score';

export interface CustomerSummary {
  id: string;
  name: string;
  customerTier?: { code: string; name: string } | null;
}

export interface UserSummary {
  id: string;
  fullName: string;
}

export interface QuotationListItem {
  id: string;
  number: string;
  status: QuotationStatus;
  riskScore: string;
  riskLevel: RiskLevel;
  totalAmount: string;
  customer: CustomerSummary;
  ownerUser: UserSummary;
  _count: { lines: number };
}

export interface QuotationLineView {
  id: string;
  sequence: number;
  description: string | null;
  quantity: string;
  unitPrice: string;
  listPrice: string;
  discountPct: string;
  applicableCeilingPct: string;
  overagePct: string;
  lineTotal: string;
  lineType: LineType;
  product: { id: string; sku: string; name: string };
  productVariant: { id: string; sku: string; name: string } | null;
  category: { id: string; code: string; name: string };
}

/** The engine result the detail endpoint computes on read. */
export interface QuotationRiskView {
  lines: Array<{ lineId: string; applicableCeilingPct: number; overagePct: number }>;
  maxSingleOverage: number;
  totalOverage: number;
  blendedScore: number;
  riskLevel: RiskLevel;
  requiredApprovalChain: Array<{ level: 'SALES_MANAGER' | 'FINANCE'; sequence: number }>;
}

export interface ApprovalStepView {
  id: string;
  level: 'SALES_MANAGER' | 'FINANCE';
  sequence: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED';
  reason: string | null;
  decidedAt: string | null;
  assigneeUser: UserSummary | null;
  decidedByUser: UserSummary | null;
}

export interface QuotationDetailView {
  id: string;
  number: string;
  status: QuotationStatus;
  riskScore: string;
  riskLevel: RiskLevel;
  maxSingleOveragePct: string;
  totalOveragePct: string;
  requiresApproval: boolean;
  subtotalAmount: string;
  discountAmount: string;
  totalAmount: string;
  marginAmount: string;
  marginPct: string;
  submittedAt: string | null;
  approvedAt: string | null;
  notes: string | null;
  customer: CustomerSummary;
  ownerUser: UserSummary;
  lines: QuotationLineView[];
  approvalSteps: ApprovalStepView[];
  risk: QuotationRiskView;
}
