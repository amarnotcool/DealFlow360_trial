import type {
  ContactDeleteResult,
  CustomerDetailView,
  CustomerListItem,
  CustomerTierView,
} from '@dealflow360/shared';

import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '../../lib/api-client';

export interface CustomerQuery {
  search?: string;
  customerTierId?: string;
  /** Deactivated customers are hidden unless the list asks for them. */
  includeInactive?: boolean;
}

function toQueryString(query: CustomerQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.customerTierId) params.set('customerTierId', query.customerTierId);
  if (query.includeInactive) params.set('includeInactive', 'true');

  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export function fetchCustomers(query: CustomerQuery = {}) {
  return apiList<CustomerListItem>(`/customers${toQueryString(query)}`);
}

export function fetchCustomer(id: string) {
  return apiGet<CustomerDetailView>(`/customers/${id}`);
}

export function fetchCustomerTiers() {
  return apiList<CustomerTierView>('/customer-tiers');
}

export interface ContactInput {
  fullName: string;
  email: string;
  phone?: string | null;
  isPrimary?: boolean;
  /** Given a password, the contact can sign in to the portal; null revokes it. */
  portalPassword?: string | null;
}

export interface CreateCustomerInput {
  name: string;
  customerTierId: string;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  /** An optional first contact, created with the customer in one call. */
  primaryContact?: ContactInput;
}

export function createCustomer(body: CreateCustomerInput) {
  return apiPost<CustomerDetailView>('/customers', body);
}

/** Every field is optional — the API merges what is sent onto the stored row. */
export type UpdateCustomerInput = Partial<Omit<CreateCustomerInput, 'primaryContact'>> & {
  isActive?: boolean;
};

export function updateCustomer(id: string, body: UpdateCustomerInput) {
  return apiPatch<CustomerDetailView>(`/customers/${id}`, body);
}

export function addContact(customerId: string, body: ContactInput) {
  return apiPost<CustomerDetailView>(`/customers/${customerId}/contacts`, body);
}

export function updateContact(
  customerId: string,
  contactId: string,
  body: Partial<ContactInput> & { isActive?: boolean },
) {
  return apiPatch<CustomerDetailView>(`/customers/${customerId}/contacts/${contactId}`, body);
}

/** Deletes a contact nothing has used; deactivates one history depends on. */
export function deleteContact(customerId: string, contactId: string) {
  return apiDelete<ContactDeleteResult>(`/customers/${customerId}/contacts/${contactId}`, {});
}
