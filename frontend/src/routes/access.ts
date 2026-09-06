// Which roles reach which screens (specs.md §2). The nav rail and the route
// guards both read this list, so a hidden nav item and a blocked route can
// never disagree. The API guards the same endpoints independently.

import type { RoleCode } from '@dealflow360/shared';

/** Sales Manager and Finance work the approval desk; a rep never sees it. */
export const APPROVALS_ROLES: RoleCode[] = ['SALES_MANAGER', 'FINANCE', 'ADMIN'];

/** Finance reconciles recurring billing, invoices and credit notes. */
export const BILLING_ROLES: RoleCode[] = ['FINANCE', 'ADMIN'];

/** Quotations and fulfillment are visible to everyone signed in. */
export const ALL_ROLES: RoleCode[] = ['SALES_REP', 'SALES_MANAGER', 'FINANCE', 'ADMIN'];

/** Reps own the customer relationship, so they maintain the book with admins. */
export const CUSTOMER_WRITE_ROLES: RoleCode[] = ['SALES_REP', 'ADMIN'];

/** Who may sign in, and as what, is admin-only. */
export const ADMIN_ONLY: RoleCode[] = ['ADMIN'];

/**
 * Discount ceilings are the policy every quotation is priced against, so
 * changing one is admin work (specs.md screen 18). The API refuses the PATCH to
 * anyone else regardless.
 */
export const DISCOUNT_CONFIG_ROLES: RoleCode[] = ['ADMIN'];

/** Finance and Ops move stock; an admin keeps the same reach (specs.md §2). */
export const INVENTORY_ROLES: RoleCode[] = ['FINANCE', 'ADMIN'];

/** Analytics is manager and admin work; finance reads the same money numbers. */
export const REPORTING_ROLES: RoleCode[] = ['SALES_MANAGER', 'FINANCE', 'ADMIN'];

/**
 * Answering a customer's negotiation request is sales work (specs.md §2 gives
 * it to the Sales Rep). Finance reads the thread but does not haggle over a
 * discount, and the API refuses it the response either way.
 */
export const NEGOTIATION_RESPOND_ROLES: RoleCode[] = ['SALES_REP', 'SALES_MANAGER', 'ADMIN'];

/** Finance watches the deal-health board; the sales manager and admin work it. */
export const DEAL_HEALTH_WRITE_ROLES: RoleCode[] = ['SALES_MANAGER', 'ADMIN'];
