// Customer book business logic and Prisma access.
//
// Two things carry weight here:
//
//  * `customer.code` is generated, not asked for. A rep adding a customer in
//    the middle of building a quote should not have to invent a code, so the
//    name is slugged and a counter breaks ties.
//  * A contact is a portal identity (schema: "Portal identity lives here").
//    One that quotations or negotiation requests point at is deactivated
//    rather than deleted, the same rule the catalogue uses for products.

import { AuditAction, Prisma } from '@prisma/client';
import type {
  ContactDeleteResult,
  CustomerContactView,
  CustomerDetailView,
  CustomerListItem,
  CustomerTierView,
  QuotationStatus,
} from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import { recordAudit } from '../../shared/audit/audit.service';
import type {
  CreateContactBody,
  CreateCustomerBody,
  ListQuery,
  UpdateContactBody,
  UpdateCustomerBody,
} from './customers.schemas';

const customerListInclude = {
  customerTier: true,
  accountOwnerUser: { select: { id: true, fullName: true } },
  _count: { select: { contacts: true, quotations: true } },
} satisfies Prisma.CustomerInclude;

type CustomerListRow = Prisma.CustomerGetPayload<{ include: typeof customerListInclude }>;

const customerDetailInclude = {
  ...customerListInclude,
  contacts: { orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }] },
  quotations: {
    orderBy: { createdAt: 'desc' },
    select: { id: true, number: true, status: true, totalAmount: true, createdAt: true },
  },
} satisfies Prisma.CustomerInclude;

type CustomerDetailRow = Prisma.CustomerGetPayload<{ include: typeof customerDetailInclude }>;

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function toTierView(row: {
  id: string;
  code: string;
  name: string;
  ceilingPct: Prisma.Decimal;
  isActive: boolean;
}): CustomerTierView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    ceilingPct: row.ceilingPct.toFixed(2),
    isActive: row.isActive,
  };
}

/** The password hash never leaves the service — only whether one exists. */
function toContactView(row: {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  isPrimary: boolean;
  isActive: boolean;
  portalPasswordHash: string | null;
  portalLastLoginAt: Date | null;
}): CustomerContactView {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    isPrimary: row.isPrimary,
    isActive: row.isActive,
    hasPortalAccess: row.portalPasswordHash !== null,
    portalLastLoginAt: row.portalLastLoginAt?.toISOString() ?? null,
  };
}

function toListItem(row: CustomerListRow): CustomerListItem {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    customerTier: toTierView(row.customerTier),
    accountOwner: row.accountOwnerUser
      ? { id: row.accountOwnerUser.id, fullName: row.accountOwnerUser.fullName }
      : null,
    email: row.email,
    phone: row.phone,
    isActive: row.isActive,
    contactCount: row._count.contacts,
    quotationCount: row._count.quotations,
  };
}

function toDetailView(row: CustomerDetailRow): CustomerDetailView {
  return {
    ...toListItem(row),
    billingAddress: row.billingAddress,
    shippingAddress: row.shippingAddress,
    contacts: row.contacts.map(toContactView),
    quotations: row.quotations.map((quotation) => ({
      id: quotation.id,
      number: quotation.number,
      status: quotation.status as QuotationStatus,
      total: quotation.totalAmount.toFixed(2),
      createdAt: quotation.createdAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listCustomers(
  query: ListQuery,
): Promise<{ rows: CustomerListItem[]; total: number }> {
  const where: Prisma.CustomerWhereInput = {
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.customerTierId ? { customerTierId: query.customerTierId } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            { code: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            { email: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: customerListInclude,
      orderBy: { name: 'asc' },
      skip: query.skip,
      take: query.take,
    }),
    prisma.customer.count({ where }),
  ]);

  return { rows: rows.map(toListItem), total };
}

export async function getCustomer(id: string): Promise<CustomerDetailView> {
  const row = await prisma.customer.findUnique({ where: { id }, include: customerDetailInclude });
  if (!row) throw new NotFoundError('Customer', id);

  return toDetailView(row);
}

export async function listCustomerTiers(): Promise<CustomerTierView[]> {
  const rows = await prisma.customerTier.findMany({
    where: { isActive: true },
    orderBy: { ceilingPct: 'asc' },
  });

  return rows.map(toTierView);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Turns a name into a stable code: letters and digits, upper-cased, with a
 * counter appended when the obvious code is taken.
 */
async function generateCode(tx: Prisma.TransactionClient, name: string): Promise<string> {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, 12) || 'CUSTOMER';

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await tx.customer.findUnique({ where: { code: candidate } });
    if (!taken) return candidate;
  }

  throw new ConflictError(`Could not derive a free customer code from "${name}"`);
}

/** Prisma's unique-constraint failure on a contact email is a 409, not a 500. */
function asEmailConflict(cause: unknown, email: string): never {
  if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
    throw new ConflictError(`${email} is already used by another contact`);
  }
  throw cause;
}

export async function createCustomer(
  body: CreateCustomerBody,
  actorUserId: string,
): Promise<CustomerDetailView> {
  const tier = await prisma.customerTier.findUnique({ where: { id: body.customerTierId } });
  if (!tier) throw new NotFoundError('Customer tier', body.customerTierId);

  // Hashing is slow enough that it does not belong inside the transaction.
  const portalPasswordHash = body.primaryContact?.portalPassword
    ? await hashPassword(body.primaryContact.portalPassword)
    : null;

  const created = await prisma
    .$transaction(async (tx) => {
      const code = await generateCode(tx, body.name);

      const customer = await tx.customer.create({
        data: {
          code,
          name: body.name,
          customerTierId: body.customerTierId,
          // The rep who adds the customer owns the account from that moment.
          accountOwnerUserId: actorUserId,
          email: body.email ?? null,
          phone: body.phone ?? null,
          billingAddress: body.billingAddress ?? null,
          shippingAddress: body.shippingAddress ?? null,
          ...(body.primaryContact
            ? {
                contacts: {
                  create: {
                    fullName: body.primaryContact.fullName,
                    email: body.primaryContact.email.toLowerCase(),
                    phone: body.primaryContact.phone ?? null,
                    isPrimary: true,
                    portalPasswordHash,
                  },
                },
              }
            : {}),
        },
      });

      await recordAudit(tx, {
        entityType: 'customer',
        entityId: customer.id,
        action: AuditAction.CREATE,
        userId: actorUserId,
        reason: `Customer ${customer.code} added`,
        changes: {
          code: customer.code,
          name: customer.name,
          customerTierId: customer.customerTierId,
          accountOwnerUserId: actorUserId,
          primaryContact: body.primaryContact?.email.toLowerCase() ?? null,
          portalAccess: portalPasswordHash !== null,
        },
      });

      return customer;
    })
    .catch((cause: unknown) => asEmailConflict(cause, body.primaryContact?.email ?? body.name));

  return getCustomer(created.id);
}

/** A before/after map, narrowed to the JSON the audit column stores. */
function asJson(changes: Record<string, { from: unknown; to: unknown }>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(changes)) as Prisma.InputJsonValue;
}

export async function updateCustomer(
  id: string,
  body: UpdateCustomerBody,
  actorUserId: string,
): Promise<CustomerDetailView> {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Customer', id);

  if (body.customerTierId) {
    const tier = await prisma.customerTier.findUnique({ where: { id: body.customerTierId } });
    if (!tier) throw new NotFoundError('Customer tier', body.customerTierId);
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const record = (field: string, from: unknown, to: unknown) => {
    if (from !== to) changes[field] = { from, to };
  };

  record('name', existing.name, body.name ?? existing.name);
  record('customerTierId', existing.customerTierId, body.customerTierId ?? existing.customerTierId);
  record('email', existing.email, body.email !== undefined ? body.email ?? null : existing.email);
  record('phone', existing.phone, body.phone !== undefined ? body.phone ?? null : existing.phone);
  record('isActive', existing.isActive, body.isActive ?? existing.isActive);

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.customerTierId !== undefined ? { customerTierId: body.customerTierId } : {}),
        ...(body.email !== undefined ? { email: body.email ?? null } : {}),
        ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
        ...(body.billingAddress !== undefined ? { billingAddress: body.billingAddress ?? null } : {}),
        ...(body.shippingAddress !== undefined
          ? { shippingAddress: body.shippingAddress ?? null }
          : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });

    await recordAudit(tx, {
      entityType: 'customer',
      entityId: id,
      action: AuditAction.UPDATE,
      userId: actorUserId,
      reason: `Customer ${existing.code} edited`,
      changes: asJson(changes),
    });
  });

  return getCustomer(id);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function addContact(
  customerId: string,
  body: CreateContactBody,
  actorUserId: string,
): Promise<CustomerDetailView> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError('Customer', customerId);

  const portalPasswordHash = body.portalPassword ? await hashPassword(body.portalPassword) : null;
  const email = body.email.toLowerCase();

  await prisma
    .$transaction(async (tx) => {
      // Only one contact per customer is the primary one.
      if (body.isPrimary) {
        await tx.customerContact.updateMany({ where: { customerId }, data: { isPrimary: false } });
      }

      const contact = await tx.customerContact.create({
        data: {
          customerId,
          fullName: body.fullName,
          email,
          phone: body.phone ?? null,
          isPrimary: body.isPrimary,
          portalPasswordHash,
        },
      });

      await recordAudit(tx, {
        entityType: 'customer_contact',
        entityId: contact.id,
        action: AuditAction.CREATE,
        userId: actorUserId,
        reason: `Contact ${contact.email} added to ${customer.code}`,
        changes: {
          customerId,
          fullName: contact.fullName,
          email: contact.email,
          isPrimary: contact.isPrimary,
          portalAccess: portalPasswordHash !== null,
        },
      });
    })
    .catch((cause: unknown) => asEmailConflict(cause, email));

  return getCustomer(customerId);
}

export async function updateContact(
  customerId: string,
  contactId: string,
  body: UpdateContactBody,
  actorUserId: string,
): Promise<CustomerDetailView> {
  const existing = await prisma.customerContact.findUnique({ where: { id: contactId } });
  if (!existing || existing.customerId !== customerId) throw new NotFoundError('Contact', contactId);

  // `portalPassword: null` revokes access; omitting the field leaves it alone.
  const portalPasswordHash =
    body.portalPassword === undefined
      ? undefined
      : body.portalPassword === null
        ? null
        : await hashPassword(body.portalPassword);

  const email = body.email?.toLowerCase();

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const record = (field: string, from: unknown, to: unknown) => {
    if (from !== to) changes[field] = { from, to };
  };

  record('fullName', existing.fullName, body.fullName ?? existing.fullName);
  record('email', existing.email, email ?? existing.email);
  record('isPrimary', existing.isPrimary, body.isPrimary ?? existing.isPrimary);
  record('isActive', existing.isActive, body.isActive ?? existing.isActive);
  if (portalPasswordHash !== undefined) {
    // The hash itself is never written to the audit log.
    record('portalAccess', existing.portalPasswordHash !== null, portalPasswordHash !== null);
  }

  await prisma
    .$transaction(async (tx) => {
      if (body.isPrimary) {
        await tx.customerContact.updateMany({
          where: { customerId, id: { not: contactId } },
          data: { isPrimary: false },
        });
      }

      await tx.customerContact.update({
        where: { id: contactId },
        data: {
          ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
          ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(portalPasswordHash !== undefined
            ? {
                portalPasswordHash,
                // Revoking access invalidates any portal token already issued.
                portalTokenVersion: existing.portalTokenVersion + 1,
              }
            : {}),
        },
      });

      await recordAudit(tx, {
        entityType: 'customer_contact',
        entityId: contactId,
        action: AuditAction.UPDATE,
        userId: actorUserId,
        reason: `Contact ${existing.email} edited`,
        changes: asJson(changes),
      });
    })
    .catch((cause: unknown) => asEmailConflict(cause, email ?? existing.email));

  return getCustomer(customerId);
}

/**
 * Deactivates a contact that quotations or negotiation requests point at, and
 * removes one nothing has used. The caller is told which happened.
 */
export async function deleteContact(
  customerId: string,
  contactId: string,
  actorUserId: string,
): Promise<ContactDeleteResult> {
  const existing = await prisma.customerContact.findUnique({ where: { id: contactId } });
  if (!existing || existing.customerId !== customerId) throw new NotFoundError('Contact', contactId);

  const [quotations, negotiations] = await Promise.all([
    prisma.quotation.count({ where: { customerContactId: contactId } }),
    prisma.negotiationRequest.count({ where: { customerContactId: contactId } }),
  ]);

  const referenced = quotations + negotiations > 0;

  if (referenced) {
    if (!existing.isActive) {
      throw new ConflictError(`Contact ${existing.email} is already deactivated`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.customerContact.update({
        where: { id: contactId },
        // Deactivating also ends any portal session the contact still holds.
        data: { isActive: false, portalTokenVersion: existing.portalTokenVersion + 1 },
      });

      await recordAudit(tx, {
        entityType: 'customer_contact',
        entityId: contactId,
        action: AuditAction.UPDATE,
        userId: actorUserId,
        reason: `Contact ${existing.email} deactivated — it is referenced by existing records`,
        changes: {
          isActive: { from: true, to: false },
          references: { quotations, negotiations },
        },
      });
    });

    return { id: contactId, outcome: 'DEACTIVATED', customer: await getCustomer(customerId) };
  }

  await prisma.$transaction(async (tx) => {
    await tx.customerContact.delete({ where: { id: contactId } });
    await recordAudit(tx, {
      entityType: 'customer_contact',
      entityId: contactId,
      action: AuditAction.DELETE,
      userId: actorUserId,
      reason: `Contact ${existing.email} deleted — nothing referenced it`,
      changes: { customerId, email: existing.email, fullName: existing.fullName },
    });
  });

  return { id: contactId, outcome: 'DELETED', customer: await getCustomer(customerId) };
}
