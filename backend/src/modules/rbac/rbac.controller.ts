// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import * as rbacService from './rbac.service';
import type { CreateUserBody, ListQuery, UpdateUserBody } from './rbac.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const { rows, total } = await rbacService.listUsers(query);

  res.json({ data: rows, error: null, meta: { total } });
}

export async function detail(req: Request, res: Response): Promise<void> {
  const user = await rbacService.getUser(req.params.id as string);
  res.json({ data: user, error: null });
}

export async function create(req: Request, res: Response): Promise<void> {
  const user = await rbacService.createUser(req.body as CreateUserBody, currentUser(req).id);
  res.status(201).json({ data: user, error: null });
}

export async function update(req: Request, res: Response): Promise<void> {
  const user = await rbacService.updateUser(
    req.params.id as string,
    req.body as UpdateUserBody,
    currentUser(req).id,
  );

  res.json({ data: user, error: null });
}

export async function deactivate(req: Request, res: Response): Promise<void> {
  const user = await rbacService.deactivateUser(req.params.id as string, currentUser(req).id);
  res.json({ data: user, error: null });
}

export async function roles(_req: Request, res: Response): Promise<void> {
  const rows = await rbacService.listRoles();
  res.json({ data: rows, error: null, meta: { total: rows.length } });
}
