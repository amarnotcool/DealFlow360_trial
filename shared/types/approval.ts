// Mirrors the Prisma enums of the same name in backend/prisma/schema.prisma.

export enum ApprovalLevel {
  SALES_MANAGER = 'SALES_MANAGER',
  FINANCE = 'FINANCE',
}

export enum ApprovalStepStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED',
}

// ---------------------------------------------------------------------------
// Wire shapes for the approvals API. Decimal columns arrive as strings.
// ---------------------------------------------------------------------------

import type { RiskLevel } from './risk-score';
import type { ApprovalStepView, CustomerSummary, UserSummary } from './quotation';
import type { QuotationStatus } from './quotation';

export interface ApprovalCounts {
  pending: number;
  returned: number;
  approved: number;
}

export interface ApprovalListItem {
  id: string;
  number: string;
  status: QuotationStatus;
  customer: Pick<CustomerSummary, 'id' | 'name'>;
  owner: UserSummary;
  riskScore: string;
  riskLevel: RiskLevel;
  maxSingleOveragePct: string;
  totalOveragePct: string;
  totalAmount: string;
  submittedAt: string | null;
  currentStep: {
    id: string;
    level: ApprovalLevel;
    sequence: number;
    assignee: UserSummary | null;
  } | null;
  steps: Array<{
    id: string;
    level: ApprovalLevel;
    sequence: number;
    status: ApprovalStepStatus;
    decidedAt: string | null;
  }>;
}

/** One line's contribution to the blended score, frozen at scoring time. */
export interface ApprovalBreakdownRow {
  lineId: string;
  product: string;
  category: { code: string; name: string };
  quantity: string;
  discountPct: string;
  tierCeilingPct: string | null;
  categoryCeilingPct: string | null;
  applicableCeilingPct: string;
  overagePct: string;
  weight: string | null;
  contribution: string | null;
  flagged: boolean;
}

export interface ApprovalDetailView {
  id: string;
  number: string;
  status: QuotationStatus;
  customer: CustomerSummary;
  owner: UserSummary;
  riskScore: string;
  riskLevel: RiskLevel;
  maxSingleOveragePct: string;
  totalOveragePct: string;
  totalAmount: string;
  breakdown: ApprovalBreakdownRow[];
  timeline: ApprovalStepView[];
}
