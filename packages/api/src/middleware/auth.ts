import type { Context, Next } from 'hono';
import type { Env } from '../index';
import { verifyToken, type JWTPayload } from '../auth/jwt';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';

const AUTH_COOKIE_NAME = 'auth_token';

// Extend Hono context with user info
declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload;
  }
}

/**
 * Extract auth token from cookie or Authorization header (for backward compatibility)
 */
function getAuthToken(request: Request): string | null {
  // First try cookie (httpOnly secure cookie)
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [name, value] = cookie.trim().split('=');
      acc[name] = value;
      return acc;
    }, {} as Record<string, string>);

    if (cookies[AUTH_COOKIE_NAME]) {
      return cookies[AUTH_COOKIE_NAME];
    }
  }

  // Fall back to Authorization header (backward compatibility for mobile app)
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

export async function authMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
) {
  const token = getAuthToken(c.req.raw);

  if (!token) {
    throw new UnauthorizedError('Token manquant');
  }

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
