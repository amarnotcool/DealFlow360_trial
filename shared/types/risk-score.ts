// Mirrors the Prisma enum of the same name in backend/prisma/schema.prisma.

export enum RiskLevel {
  NONE = 'NONE',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

/**
 * One quotation line as the discount engine sees it. The engine never looks
 * ceilings up itself — the caller resolves them and passes them in.
 * All percentages are decimal percent at Decimal(6,2) scale (12.5 means 12.5%).
 */
export interface DiscountEngineLineInput {
  lineId: string;
  categoryId: string;
  tierCeilingPct: number;
  categoryCeilingPct: number;
  discountPct: number;
}

export interface DiscountEngineInput {
  lines: DiscountEngineLineInput[];
}

/** Per-line result: the ceiling that actually applied and how far the line went over it. */
export interface DiscountEngineLineResult {
  lineId: string;
  applicableCeilingPct: number;
  overagePct: number;
}

/** One step of the required approval chain, in the order it must be walked. */
export interface RequiredApprovalStep {
  level: ApprovalChainLevel;
  sequence: number;
}

/** The approval levels the engine can require. Mirrors Prisma's ApprovalLevel. */
export type ApprovalChainLevel = 'SALES_MANAGER' | 'FINANCE';

export interface DiscountEngineResult {
  lines: DiscountEngineLineResult[];
  maxSingleOverage: number;
  totalOverage: number;
  blendedScore: number;
  riskLevel: RiskLevel;
  requiredApprovalChain: RequiredApprovalStep[];
}
