/**
 * CSRF Protection Middleware
 *
 * Implements double-submit cookie pattern with:
 * - CSRF token generation and validation
 * - Origin/Referer header validation
 * - Safe method bypass (GET, HEAD, OPTIONS)
 */

import type { Context, Next, MiddlewareHandler } from 'hono';
import type { Env } from '../index';

const CSRF_TOKEN_LENGTH = 32;
const CSRF_TOKEN_HEADER = 'X-CSRF-Token';
const CSRF_TOKEN_COOKIE = 'csrf_token';
const CSRF_TOKEN_TTL = 3600; // 1 hour

// Methods that don't require CSRF protection
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Generate a cryptographically secure CSRF token
 */
function generateCSRFToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CSRF_TOKEN_LENGTH));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validate Origin/Referer headers against allowed origins
 */
function validateOrigin(
  request: Request,
  allowedOrigins: string[]
): { valid: boolean; origin?: string } {
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');

  // Check Origin header first
  if (origin) {
    const isAllowed = allowedOrigins.some(
      (allowed) => origin === allowed || origin.endsWith(`.${new URL(allowed).host}`)
    );
    return { valid: isAllowed, origin };
  }

  // Fall back to Referer
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      const isAllowed = allowedOrigins.some(
        (allowed) => refererOrigin === allowed
      );
      return { valid: isAllowed, origin: refererOrigin };
    } catch {
      return { valid: false };
    }
  }

  // No origin info - reject for state-changing methods
  return { valid: false };
}

/**
 * Extract CSRF token from cookie
 */
function getTokenFromCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, value] = cookie.trim().split('=');
    acc[name] = value;
    return acc;
  }, {} as Record<string, string>);

  return cookies[CSRF_TOKEN_COOKIE] || null;
}

export interface CSRFConfig {
  /** Allowed origins for CSRF validation */
  allowedOrigins: string[];

  /** Skip CSRF for these paths (regex patterns) */
  skipPaths?: RegExp[];

  /** Enable strict origin checking */
  strictOrigin?: boolean;
}

/**
 * CSRF Protection Middleware
 *
 * Usage:
 * ```typescript
 * app.use('/api/*', csrfProtection({
 *   allowedOrigins: ['https://app.example.com'],
 * }));
 * ```
 */
export function csrfProtection(config: CSRFConfig): MiddlewareHandler<{ Bindings: Env }> {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const method = c.req.method;

    // Safe methods don't need CSRF protection
    if (SAFE_METHODS.includes(method)) {
      // Generate token for subsequent requests
      await ensureCSRFToken(c);
      return next();
    }

    // Check if path should be skipped
    if (config.skipPaths) {
      const path = new URL(c.req.url).pathname;
      if (config.skipPaths.some((pattern) => pattern.test(path))) {
        return next();
      }
    }

    // Validate Origin/Referer
    if (config.strictOrigin !== false) {
      const originCheck = validateOrigin(c.req.raw, config.allowedOrigins);
      if (!originCheck.valid) {
        return c.json(
          {
            error: {
              code: 'CSRF_ORIGIN_INVALID',
              message: 'Invalid request origin',
            },
          },
          403
        );
      }
    }

    // Validate CSRF token
    const headerToken = c.req.header(CSRF_TOKEN_HEADER);
    const cookieToken = getTokenFromCookie(c.req.raw);

    if (!headerToken || !cookieToken) {
      return c.json(
        {
          error: {
            code: 'CSRF_TOKEN_MISSING',
            message: 'CSRF token missing',
          },
        },
        403
      );
    }

    // Constant-time comparison to prevent timing attacks
    if (!constantTimeEqual(headerToken, cookieToken)) {
      return c.json(
        {
          error: {
            code: 'CSRF_TOKEN_INVALID',
            message: 'Invalid CSRF token',
          },
        },
        403
      );
    }

    // Token is valid, continue
    await next();

    // Rotate token after successful mutation
    await rotateCSRFToken(c);
  };
}

/**
 * Ensure a CSRF token exists in cookies
 */
async function ensureCSRFToken(c: Context<{ Bindings: Env }>): Promise<void> {
  const existingToken = getTokenFromCookie(c.req.raw);

  if (!existingToken) {
    const token = generateCSRFToken();
    setCSRFCookie(c, token);
  }
}

/**
 * Rotate CSRF token after successful mutation
 */
async function rotateCSRFToken(c: Context<{ Bindings: Env }>): Promise<void> {
  const token = generateCSRFToken();
  setCSRFCookie(c, token);
}

/**
 * Set CSRF token cookie
 */
function setCSRFCookie(c: Context<{ Bindings: Env }>, token: string): void {
  const isProduction = c.env.ENVIRONMENT === 'production';

  c.header(
    'Set-Cookie',
    `${CSRF_TOKEN_COOKIE}=${token}; Path=/; HttpOnly=false; SameSite=Strict; Max-Age=${CSRF_TOKEN_TTL}${isProduction ? '; Secure' : ''}`
  );
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Endpoint to get a CSRF token
 * Use this for SPAs that need to fetch the token
 */
export function csrfTokenEndpoint(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c: Context<{ Bindings: Env }>) => {
    const token = generateCSRFToken();
    setCSRFCookie(c, token);

    return c.json({ csrfToken: token });
  };
}
