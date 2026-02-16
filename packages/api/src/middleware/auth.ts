import type { Context, Next } from 'hono';
import type { Env } from '../index';
import { verifyToken, type JWTPayload } from '../auth/jwt';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';

// Extend Hono context with user info
declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload;
  }
}

export async function authMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token manquant');
  }

  const token = authHeader.substring(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    throw new UnauthorizedError('Token invalide ou expiré');
  }

  // Store user in context
  c.set('user', payload);

  await next();
}

export function roleGuard(...allowedRoles: Array<'admin' | 'operator' | 'consultant'>) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const user = c.get('user');

    if (!user) {
      throw new UnauthorizedError('Non authentifié');
    }

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenError('Rôle insuffisant pour cette action');
    }

    await next();
  };
}
