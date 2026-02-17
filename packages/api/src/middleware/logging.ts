/**
 * Structured Request Logging Middleware
 *
 * Provides:
 * - Request ID generation and propagation (X-Request-ID)
 * - Structured JSON logging for all requests
 * - Performance timing metrics
 * - Error tracking integration
 */

import type { Context, Next, MiddlewareHandler } from 'hono';
import type { Env } from '../index';
import { generateId } from '../lib/ulid';

const REQUEST_ID_HEADER = 'X-Request-ID';

// Extend Hono context with request metadata
declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
    requestStartTime: number;
  }
}

interface RequestLogEntry {
  type: 'http_request';
  timestamp: string;
  request_id: string;
  method: string;
  path: string;
  query?: string;
  status: number;
  duration_ms: number;
  user_id?: string;
  user_agent?: string;
  ip?: string;
  error?: {
    code?: string;
    message: string;
  };
}

/**
 * Extract client IP from request headers
 * Handles Cloudflare and common proxy headers
 */
function getClientIP(request: Request): string | undefined {
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Real-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    undefined
  );
}

/**
 * Request logging middleware
 *
 * Usage:
 * ```typescript
 * app.use('*', requestLogging());
 * ```
 */
export function requestLogging(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // Generate or use existing request ID
    const incomingRequestId = c.req.header(REQUEST_ID_HEADER);
    const requestId = incomingRequestId ?? generateId('req');
    const startTime = Date.now();

    // Store in context for use by other handlers
    c.set('requestId', requestId);
    c.set('requestStartTime', startTime);

    // Add request ID to response headers
    c.header(REQUEST_ID_HEADER, requestId);

    try {
      await next();
    } finally {
      const duration = Date.now() - startTime;
      const url = new URL(c.req.url);

      // Get user ID if authenticated
      let userId: string | undefined;
      try {
        const user = c.get('user');
        userId = user?.sub;
      } catch {
        // User not set (unauthenticated request)
      }

      // Build log entry
      const logEntry: RequestLogEntry = {
        type: 'http_request',
        timestamp: new Date().toISOString(),
        request_id: requestId,
        method: c.req.method,
        path: url.pathname,
        status: c.res.status,
        duration_ms: duration,
      };

      // Add optional fields
      if (url.search) {
        logEntry.query = url.search;
      }

      if (userId) {
        logEntry.user_id = userId;
      }

      const userAgent = c.req.header('User-Agent');
      if (userAgent) {
        logEntry.user_agent = userAgent;
      }

      const clientIP = getClientIP(c.req.raw);
      if (clientIP) {
        logEntry.ip = clientIP;
      }

      // Log as structured JSON
      console.log(JSON.stringify(logEntry));
    }
  };
}

/**
 * Get the current request ID from context
 * Useful for including in error responses or downstream service calls
 */
export function getRequestId(c: Context): string | undefined {
  try {
    return c.get('requestId');
  } catch {
    return undefined;
  }
}

/**
 * Create a child logger for a specific component
 * Includes the request ID in all log entries
 */
export function createComponentLogger(c: Context, component: string) {
  const requestId = getRequestId(c);

  return {
    info: (message: string, data?: Record<string, unknown>) => {
      console.log(
        JSON.stringify({
          type: 'log',
          level: 'info',
          timestamp: new Date().toISOString(),
          request_id: requestId,
          component,
          message,
          ...data,
        })
      );
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      console.log(
        JSON.stringify({
          type: 'log',
          level: 'warn',
          timestamp: new Date().toISOString(),
          request_id: requestId,
          component,
          message,
          ...data,
        })
      );
    },
    error: (message: string, error?: Error, data?: Record<string, unknown>) => {
      console.log(
        JSON.stringify({
          type: 'log',
          level: 'error',
          timestamp: new Date().toISOString(),
          request_id: requestId,
          component,
          message,
          error: error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : undefined,
          ...data,
        })
      );
    },
  };
}
