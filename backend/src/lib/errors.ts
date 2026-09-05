// Typed errors thrown by services. error-handler.ts turns them into responses.

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} ${id} was not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, 400);
  }
}

/** The request was well formed but the entity is not in a state that allows it. */
export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

/** No usable session on a request that needs one. */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required') {
    super('UNAUTHORIZED', message, 401);
  }
}

/** A real session, but the role it carries is not allowed to do this. */
export class ForbiddenError extends AppError {
  constructor(message: string) {
    super('FORBIDDEN', message, 403);
  }
}
