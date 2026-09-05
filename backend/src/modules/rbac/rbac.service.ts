// Staff user directory: who can sign in to the workspace, and as what.
//
// A user is never deleted. Quotations they own, approval steps they decided and
// every audit row they wrote point at the account, so removing it would erase
// the trail those records depend on — deactivating stops the login instead, a
// check `auth.login` and `auth.getMe` already make.

import { AuditAction, Prisma } from '@prisma/client';
import type { RoleCode, RoleView, StaffUserDetailView, StaffUserListItem } from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import { recordAudit } from '../../shared/audit/audit.service';
import type { CreateUserBody, ListQuery, UpdateUserBody } from './rbac.schemas';

/** Mirrors auth.service: the most capable role is the one guards are checked against. */
const ROLE_RANK: Record<RoleCode, number> = {
  SALES_REP: 1,
  SALES_MANAGER: 2,
  FINANCE: 3,
  ADMIN: 4,
};

const userInclude = {
  userRoles: { include: { role: true } },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function knownRoles(row: UserRow): RoleCode[] {
  return row.userRoles
    .map((link) => link.role.code)
    .filter((code): code is RoleCode => code in ROLE_RANK)
    .sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]);
}

function toListItem(row: UserRow): StaffUserListItem {
  const roles = knownRoles(row);

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    roles,
    // Sorted highest first, so the head of the list is the effective role.
    role: roles[0] ?? 'SALES_REP',
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listUsers(
  query: ListQuery,
): Promise<{ rows: StaffUserListItem[]; total: number }> {
  const where: Prisma.UserWhereInput = {
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.role ? { userRoles: { some: { role: { code: query.role } } } } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            { email: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: { fullName: 'asc' },
      skip: query.skip,
      take: query.take,
    }),
    prisma.user.count({ where }),
  ]);

  return { rows: rows.map(toListItem), total };
}

export async function getUser(id: string): Promise<StaffUserDetailView> {
  const row = await prisma.user.findUnique({ where: { id }, include: userInclude });
  if (!row) throw new NotFoundError('User', id);

  // What a deactivation preserves — the reason the account is never deleted.
  const [ownedQuotationCount, decidedApprovalCount, ownedCustomerCount] = await Promise.all([
    prisma.quotation.count({ where: { ownerUserId: id } }),
    prisma.approvalStep.count({ where: { decidedByUserId: id } }),
    prisma.customer.count({ where: { accountOwnerUserId: id } }),
  ]);

  return {
    ...toListItem(row),
    ownedQuotationCount,
    decidedApprovalCount,
    ownedCustomerCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRoles(): Promise<RoleView[]> {
  const rows = await prisma.role.findMany({ orderBy: { name: 'asc' } });

  return rows
    .filter((row): row is typeof row & { code: RoleCode } => row.code in ROLE_RANK)
    .map((row) => ({ id: row.id, code: row.code, name: row.name, description: row.description }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function asEmailConflict(cause: unknown, email: string): never {
  if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
    throw new ConflictError(`${email} is already used by another user`);
  }
  throw cause;
}

async function roleIdFor(tx: Prisma.TransactionClient, code: RoleCode): Promise<string> {
  const role = await tx.role.findUnique({ where: { code } });
  if (!role) throw new NotFoundError('Role', code);
  return role.id;
}

/** A before/after map, narrowed to the JSON the audit column stores. */
function asJson(changes: Record<string, { from: unknown; to: unknown }>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(changes)) as Prisma.InputJsonValue;
}

export async function createUser(
  body: CreateUserBody,
  actorUserId: string,
): Promise<StaffUserDetailView> {
  const email = body.email.toLowerCase();
  const passwordHash = await hashPassword(body.password);

  const created = await prisma
    .$transaction(async (tx) => {
      const roleId = await roleIdFor(tx, body.role);

      const user = await tx.user.create({
        data: {
          email,
          fullName: body.fullName,
          passwordHash,
          userRoles: { create: { roleId } },
        },
      });

      await recordAudit(tx, {
        entityType: 'user',
        entityId: user.id,
        action: AuditAction.CREATE,
        userId: actorUserId,
        reason: `Staff account ${user.email} created as ${body.role}`,
        // The password itself is never written to the audit log.
        changes: { email: user.email, fullName: user.fullName, role: body.role },
      });

      return user;
    })
    .catch((cause: unknown) => asEmailConflict(cause, email));

  return getUser(created.id);
}

export async function updateUser(
  id: string,
  body: UpdateUserBody,
  actorUserId: string,
): Promise<StaffUserDetailView> {
  const existing = await prisma.user.findUnique({ where: { id }, include: userInclude });
  if (!existing) throw new NotFoundError('User', id);

  // An admin who could switch off their own account would lock the workspace
  // out of user management entirely.
  if (id === actorUserId && body.isActive === false) {
    throw new ValidationError('You cannot deactivate your own account');
  }
  if (id === actorUserId && body.role !== undefined && body.role !== 'ADMIN') {
    throw new ValidationError('You cannot take the admin role away from your own account');
  }

  const email = body.email?.toLowerCase();
  const passwordHash = body.password ? await hashPassword(body.password) : undefined;
  const currentRoles = knownRoles(existing);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const record = (field: string, from: unknown, to: unknown) => {
    if (from !== to) changes[field] = { from, to };
  };

  record('fullName', existing.fullName, body.fullName ?? existing.fullName);
  record('email', existing.email, email ?? existing.email);
  record('role', currentRoles.join(', '), body.role ?? currentRoles.join(', '));
  record('isActive', existing.isActive, body.isActive ?? existing.isActive);
  if (passwordHash) record('password', 'set', 'replaced');

  await prisma
    .$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(passwordHash
            ? // A new password ends the sessions issued against the old one.
              { passwordHash, tokenVersion: existing.tokenVersion + 1 }
            : {}),
        },
      });

      if (body.role !== undefined) {
        // One role per account: the old links go, the chosen one replaces them.
        const roleId = await roleIdFor(tx, body.role);
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.create({ data: { userId: id, roleId } });
      }

      await recordAudit(tx, {
        entityType: 'user',
        entityId: id,
        action: AuditAction.UPDATE,
        userId: actorUserId,
        reason: `Staff account ${existing.email} edited`,
        changes: asJson(changes),
      });
    })
    .catch((cause: unknown) => asEmailConflict(cause, email ?? existing.email));

  return getUser(id);
}

/** Deactivation, never deletion — the account's history has to survive it. */
export async function deactivateUser(
  id: string,
  actorUserId: string,
): Promise<StaffUserDetailView> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('User', id);

  if (id === actorUserId) {
    throw new ValidationError('You cannot deactivate your own account');
  }
  if (!existing.isActive) {
    throw new ConflictError(`${existing.email} is already deactivated`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      // Bumping the token version ends any session the account still holds.
      data: { isActive: false, tokenVersion: existing.tokenVersion + 1 },
    });

    await recordAudit(tx, {
      entityType: 'user',
      entityId: id,
      action: AuditAction.DELETE,
      userId: actorUserId,
      reason: `Staff account ${existing.email} deactivated — its history is kept`,
      changes: { isActive: { from: true, to: false } },
    });
  });

  return getUser(id);
}
