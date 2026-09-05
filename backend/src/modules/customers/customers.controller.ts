// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import * as customersService from './customers.service';
import type {
  CreateContactBody,
  CreateCustomerBody,
  ListQuery,
  UpdateContactBody,
  UpdateCustomerBody,
} from './customers.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const { rows, total } = await customersService.listCustomers(query);

  res.json({ data: rows, error: null, meta: { total } });
}

export async function detail(req: Request, res: Response): Promise<void> {
  const customer = await customersService.getCustomer(req.params.id as string);
  res.json({ data: customer, error: null });
}

export async function create(req: Request, res: Response): Promise<void> {
  const customer = await customersService.createCustomer(
    req.body as CreateCustomerBody,
    currentUser(req).id,
  );

  res.status(201).json({ data: customer, error: null });
}

export async function update(req: Request, res: Response): Promise<void> {
  const customer = await customersService.updateCustomer(
    req.params.id as string,
    req.body as UpdateCustomerBody,
    currentUser(req).id,
  );

  res.json({ data: customer, error: null });
}

export async function createContact(req: Request, res: Response): Promise<void> {
  const customer = await customersService.addContact(
    req.params.id as string,
    req.body as CreateContactBody,
    currentUser(req).id,
  );

  res.status(201).json({ data: customer, error: null });
}

export async function updateContact(req: Request, res: Response): Promise<void> {
  const customer = await customersService.updateContact(
    req.params.id as string,
    req.params.contactId as string,
    req.body as UpdateContactBody,
    currentUser(req).id,
  );

  res.json({ data: customer, error: null });
}

export async function removeContact(req: Request, res: Response): Promise<void> {
  const result = await customersService.deleteContact(
    req.params.id as string,
    req.params.contactId as string,
    currentUser(req).id,
  );

  res.json({ data: result, error: null });
}

export async function tiers(_req: Request, res: Response): Promise<void> {
  const rows = await customersService.listCustomerTiers();
  res.json({ data: rows, error: null, meta: { total: rows.length } });
}
