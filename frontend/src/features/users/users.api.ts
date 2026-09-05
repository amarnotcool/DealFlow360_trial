import type {
  RoleCode,
  RoleView,
  StaffUserDetailView,
  StaffUserListItem,
} from '@dealflow360/shared';

import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '../../lib/api-client';

export interface UserQuery {
  search?: string;
  role?: RoleCode;
  /** The directory lists deactivated accounts by default — the API's default too. */
  includeInactive?: boolean;
}

function toQueryString(query: UserQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.role) params.set('role', query.role);
  params.set('includeInactive', query.includeInactive === false ? 'false' : 'true');

  return `?${params.toString()}`;
}

export function fetchUsers(query: UserQuery = {}) {
  return apiList<StaffUserListItem>(`/users${toQueryString(query)}`);
}

export function fetchUser(id: string) {
  return apiGet<StaffUserDetailView>(`/users/${id}`);
}

export function fetchRoles() {
  return apiList<RoleView>('/roles');
}

export interface CreateUserInput {
  fullName: string;
  email: string;
  /** An admin types the first password; there is no signup and no reset flow. */
  password: string;
  role: RoleCode;
}

export function createUser(body: CreateUserInput) {
  return apiPost<StaffUserDetailView>('/users', body);
}

export type UpdateUserInput = Partial<CreateUserInput> & { isActive?: boolean };

export function updateUser(id: string, body: UpdateUserInput) {
  return apiPatch<StaffUserDetailView>(`/users/${id}`, body);
}

/** Deactivates the account; a staff user is never deleted. */
export function deactivateUser(id: string) {
  return apiDelete<StaffUserDetailView>(`/users/${id}`, {});
}
