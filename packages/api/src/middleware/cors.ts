import { cors } from 'hono/cors';
import type { Context, MiddlewareHandler } from 'hono';

/**
 * Environment-based CORS configuration
 *
 * Origins are configured via ALLOWED_ORIGINS env variable (comma-separated)
 * Defaults to localhost for development
 */
export function createCorsMiddleware(allowedOrigins?: string): MiddlewareHandler {
  // Parse origins from env or use defaults for development
  const origins = allowedOrigins
    ? allowedOrigins.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:8787'];

  return cors({
    origin: (origin: string) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return '*';
      // Check if origin is in the allowed list
      return origins.includes(origin) ? origin : origins[0];
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    credentials: true,
    maxAge: 86400,
  });
}

// Default middleware for backward compatibility
export const corsMiddleware = createCorsMiddleware();
