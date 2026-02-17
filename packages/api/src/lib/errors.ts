import type { Context } from 'hono';
import type { Env } from '../index';
import { generateId } from './ulid';

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

export class BadRequestError extends AppError {
  constructor(message = 'Requête invalide') {
    super(400, message, 'BAD_REQUEST');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflit de données') {
    super(409, message, 'CONFLICT');
  }
}

/**
 * Standardized error response format
 */
interface ErrorResponse {
  error: {
    id: string;
    code: string;
    message: string;
    request_id?: string;
    stack?: string;
  };
}

export function errorHandler(err: Error, c: Context<{ Bindings: Env }>) {
  // Get request ID from context if available
  let requestId: string | undefined;
  try {
    requestId = c.get('requestId');
  } catch {
    // Context variable not set
  }

  // Generate unique error ID for tracking
  const errorId = generateId('err');

  // Determine if we should include stack trace (dev only)
  const isDev = c.env.ENVIRONMENT !== 'production';

  // Log error with full details
  console.error(
    JSON.stringify({
      type: 'error',
      timestamp: new Date().toISOString(),
      error_id: errorId,
      request_id: requestId,
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err instanceof AppError ? err.code : 'INTERNAL_ERROR',
    })
  );

  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: {
        id: errorId,
        code: err.code ?? 'APP_ERROR',
        message: err.message,
        request_id: requestId,
      },
    };

    if (isDev && err.stack) {
      response.error.stack = err.stack;
    }

    return c.json(response, err.statusCode as 400 | 401 | 403 | 404 | 409);
  }

  // Internal server error - don't expose details in production
  const response: ErrorResponse = {
    error: {
      id: errorId,
      code: 'INTERNAL_ERROR',
      message: isDev ? err.message : 'Erreur interne du serveur',
      request_id: requestId,
    },
  };

  if (isDev && err.stack) {
    response.error.stack = err.stack;
  }

  return c.json(response, 500);
}
