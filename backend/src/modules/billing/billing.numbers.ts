// Document numbering, shared by the billing and subscription services.
// Kept apart from the services so a credit note raised while cancelling a
// subscription is numbered the same way as one raised against an invoice.

import type { Prisma } from '@prisma/client';

async function nextNumber(
  tx: Prisma.TransactionClient,
  prefix: string,
  latest: string | undefined,
): Promise<string> {
  const lastCounter = latest ? Number.parseInt(latest.slice(prefix.length), 10) : 0;
  return `${prefix}${String(lastCounter + 1).padStart(4, '0')}`;
}

export async function nextInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = `INV-${new Date().getFullYear()}-`;
  const latest = await tx.invoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  return nextNumber(tx, prefix, latest?.number);
}

export async function nextCreditNoteNumber(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = `CN-${new Date().getFullYear()}-`;
  const latest = await tx.creditNote.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  return nextNumber(tx, prefix, latest?.number);
}
