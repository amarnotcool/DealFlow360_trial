// The staff directory: who can sign in to the workspace, and as what.
// Admin-only, on the route and at the API both.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError, RoleCode, RoleView, StaffUserListItem } from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Button,
  Card,
  CardLabel,
  CardMetric,
  EmptyCard,
  ErrorCard,
  FilterPill,
  LoadingCard,
  SearchInput,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { fetchRoles, fetchUsers } from '../../../features/users/users.api';
import { dateTime } from '../../../lib/format';
import { NewUserForm } from './NewUserForm';
import { RoleBadge } from './role-badge';

export default function UsersList() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<StaffUserListItem[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [error, setError] = useState<ApiError | null>(null);

  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleCode | ''>('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    const response = await fetchUsers({
      search: search.trim() || undefined,
      role: role || undefined,
    });

    setRows(response.data ?? []);
    setTotal(response.meta?.total ?? null);
    setError(response.error);
  }, [search, role]);

  useEffect(() => {
    // Typing filters the list, so the request waits for a pause in typing.
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    void fetchRoles().then((response) => setRoles(response.data ?? []));
  }, []);

  const counts = useMemo(() => {
    const list = rows ?? [];
    return {
      active: list.filter((row) => row.isActive).length,
      admins: list.filter((row) => row.role === 'ADMIN').length,
    };
  }, [rows]);

  const activeRole = roles.find((option) => option.code === role);

  return (
    <InternalLayout
      breadcrumb={['DealFlow360']}
      title="Staff users"
      actions={
        <Button onClick={() => setCreating((open) => !open)}>
          {creating ? 'Close' : 'New User'}
        </Button>
      }
    >
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-3">
        <Card tone="obsidian">
          <CardLabel>Accounts</CardLabel>
          <CardMetric>{total ?? '—'}</CardMetric>
          <p className="text-body-sm text-obsidian-muted">including deactivated accounts</p>
        </Card>
        <Card>
          <CardLabel>Can sign in</CardLabel>
          <CardMetric>{rows ? counts.active : '—'}</CardMetric>
          <p className="text-body-sm text-ink-subtle">a deactivated account is refused at login</p>
        </Card>
        <Card>
          <CardLabel>Admins</CardLabel>
          <CardMetric>{rows ? counts.admins : '—'}</CardMetric>
          <p className="text-body-sm text-ink-subtle">who can manage this directory</p>
        </Card>
      </div>

      {creating && (
        <div className="mb-lg">
          <NewUserForm
            roles={roles}
            onCancel={() => setCreating(false)}
            onCreated={(user) => {
              setCreating(false);
              navigate(`/users/${user.id}`);
            }}
          />
        </div>
      )}

      <TableShell>
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">Directory</h2>
            <p className="text-body-sm text-ink-subtle">
              Open an account to change its role, reset its password, or switch it off.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-xs">
            <SearchInput
              placeholder="Search name or email"
              aria-label="Search users"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-[16rem] max-w-full"
            />
            <FilterPill label="Role" value="All" active={role === ''} onClick={() => setRole('')} />
            {roles.map((option) => (
              <FilterPill
                key={option.id}
                label="Role"
                value={option.name}
                active={role === option.code}
                onClick={() => setRole(option.code)}
              />
            ))}
          </div>
        </TableToolbar>

        {rows === null ? (
          <div className="p-lg">
            <LoadingCard label="Staff users" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-lg">
            <EmptyCard
              message={
                search || role
                  ? `No staff accounts match ${search ? `"${search}"` : ''}${
                      search && activeRole ? ' as ' : ''
                    }${activeRole ? activeRole.name : ''}.`
                  : 'No staff accounts yet.'
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Last login</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/users/${row.id}`)}
                >
                  <Td className="font-semibold text-ink">{row.fullName}</Td>
                  <Td>{row.email}</Td>
                  <Td>
                    <RoleBadge role={row.role} />
                  </Td>
                  <Td>
                    {row.isActive ? (
                      <span className="text-body-sm text-ink-subtle">Active</span>
                    ) : (
                      <Badge variant="critical">Deactivated</Badge>
                    )}
                  </Td>
                  <Td className="text-ink-subtle">
                    {row.lastLoginAt ? dateTime(row.lastLoginAt) : 'Never signed in'}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableShell>
    </InternalLayout>
  );
}
