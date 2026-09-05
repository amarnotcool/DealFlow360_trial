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

/** Finance and Ops move stock; an admin keeps the same reach (specs.md §2). */
export const INVENTORY_ROLES: RoleCode[] = ['FINANCE', 'ADMIN'];

/** Analytics is manager and admin work; finance reads the same money numbers. */
export const REPORTING_ROLES: RoleCode[] = ['SALES_MANAGER', 'FINANCE', 'ADMIN'];

/** Finance watches the deal-health board; the sales manager and admin work it. */
export const DEAL_HEALTH_WRITE_ROLES: RoleCode[] = ['SALES_MANAGER', 'ADMIN'];
