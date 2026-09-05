// Portal login. A customer contact signs in with the credentials on their
// contact record — a separate identity from the staff `user` table, verified
// against portalPasswordHash and issued a token from the portal secret.

import bcrypt from 'bcryptjs';
import type { PortalLoginResponse, PortalUser } from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { UnauthorizedError } from '../../lib/errors';
import { signPortalToken } from '../../lib/jwt';

const contactWithCustomer = {
  customer: {
    select: {
      id: true,
      name: true,
      // The tier's name reaches the customer; its ceiling never does — that is
      // internal discount policy, not the customer's business.
      customerTier: { select: { code: true, name: true } },
    },
  },
} as const;

export async function login(email: string, password: string): Promise<PortalLoginResponse> {
  const contact = await prisma.customerContact.findUnique({
    where: { email: email.toLowerCase() },
    include: contactWithCustomer,
  });

  // One message for both failures, so the response never says which contacts exist.
  const invalid = new UnauthorizedError('Email or password is incorrect');

  if (!contact || !contact.isActive || !contact.portalPasswordHash) {
    throw invalid;
  }
  if (!(await bcrypt.compare(password, contact.portalPasswordHash))) {
    throw invalid;
  }

  await prisma.customerContact.update({
    where: { id: contact.id },
    data: { portalLastLoginAt: new Date() },
  });

  return { token: signPortalToken(contact.id, contact.customerId), user: toPortalUser(contact) };
}

export async function getMe(contactId: string): Promise<PortalUser> {
  const contact = await prisma.customerContact.findUnique({
    where: { id: contactId },
    include: contactWithCustomer,
  });

  if (!contact || !contact.isActive) {
    throw new UnauthorizedError('This portal session belongs to a contact that is no longer active');
  }

  return toPortalUser(contact);
}

function toPortalUser(contact: {
  id: string;
  customerId: string;
  fullName: string;
  email: string;
  customer: { name: string; customerTier: { code: string; name: string } };
}): PortalUser {
  return {
    contactId: contact.id,
    customerId: contact.customerId,
    fullName: contact.fullName,
    email: contact.email,
    customerName: contact.customer.name,
    customerTier: contact.customer.customerTier,
  };
}
