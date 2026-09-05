// Wire shapes for the customer book and the staff user directory.
//
// Money and percentages cross the boundary as strings, the way Prisma
// serialises Decimal; formatting belongs in the frontend's lib/format.ts.

import type { RoleCode } from './auth';
import type { QuotationStatus } from './quotation';

export interface CustomerTierView {
  id: string;
  code: string;
  name: string;
  /** The tier's discount ceiling, e.g. "20.00" for 20%. */
  ceilingPct: string;
  isActive: boolean;
}

export interface CustomerContactView {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  isPrimary: boolean;
  isActive: boolean;
  /** True when the contact can sign in to the portal — the hash is never sent. */
  hasPortalAccess: boolean;
  portalLastLoginAt: string | null;
}

/** One row of GET /customers. */
export interface CustomerListItem {
  id: string;
  code: string;
  name: string;
  customerTier: CustomerTierView;
  accountOwner: { id: string; fullName: string } | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  contactCount: number;
  quotationCount: number;
}

/** A customer's quotations, summarised — the detail screen links out to them. */
export interface CustomerQuotationSummary {
  id: string;
  number: string;
  status: QuotationStatus;
  total: string;
  createdAt: string;
}

/** GET /customers/:id. */
export interface CustomerDetailView extends CustomerListItem {
  billingAddress: string | null;
  shippingAddress: string | null;
  contacts: CustomerContactView[];
  quotations: CustomerQuotationSummary[];
  createdAt: string;
  updatedAt: string;
}

/** Deleting a contact answers with what actually happened. */
export interface ContactDeleteResult {
  id: string;
  /** DEACTIVATED when quotations or negotiations reference the contact. */
  outcome: 'DEACTIVATED' | 'DELETED';
  customer: CustomerDetailView;
}

// ---------------------------------------------------------------------------
// Staff users
// ---------------------------------------------------------------------------

export interface RoleView {
  id: string;
  code: RoleCode;
  name: string;
  description: string | null;
}

export interface StaffUserListItem {
  id: string;
  email: string;
  fullName: string;
  /** Every role held. The guards check `role`, the highest-ranking of these. */
  roles: RoleCode[];
  role: RoleCode;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface StaffUserDetailView extends StaffUserListItem {
  /** Quotations owned and approval steps decided — what a deactivation keeps. */
  ownedQuotationCount: number;
  decidedApprovalCount: number;
  ownedCustomerCount: number;
  createdAt: string;
  updatedAt: string;
}
