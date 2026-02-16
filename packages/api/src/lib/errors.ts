import type { Context } from 'hono';
import type { Env } from '../index';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Non autorisé') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Accès interdit') {
    super(403, message, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Ressource non trouvée') {
    super(404, message, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Données invalides') {
    super(400, message, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflit de données') {
    super(409, message, 'CONFLICT');
  }
}

export function errorHandler(err: Error, c: Context<{ Bindings: Env }>) {
  console.error('Error:', err);

  if (err instanceof AppError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
        },
      },
      err.statusCode as 400 | 401 | 403 | 404 | 409
    );
  }

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erreur interne du serveur',
      },
    },
    500
  );
}
