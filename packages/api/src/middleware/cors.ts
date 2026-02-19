import { cors } from 'hono/cors';
import type { Context, MiddlewareHandler } from 'hono';

/**
 * Environment-based CORS configuration
 *
 * Origins are configured via ALLOWED_ORIGINS env variable (comma-separated)
 * Defaults to localhost for development
 *
 * SECURITY: Requests without Origin header are rejected for sensitive endpoints.
 * Mobile apps should use Authorization header with Bearer token instead.
 */

// Paths that allow requests without Origin (public endpoints)
const ORIGIN_EXEMPT_PATHS = [
  '/api/health',
  '/api/version',
  '/',
];

export function createCorsMiddleware(allowedOrigins?: string, isProduction = false): MiddlewareHandler {
  // Parse origins from env or use defaults for development
  const origins = allowedOrigins
    ? allowedOrigins.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:8787'];

  return cors({
    origin: (origin: string, c: Context) => {
      const path = new URL(c.req.url).pathname;

      // Allow requests without origin ONLY for exempt paths
      if (!origin) {
        // Check if path is exempt (health checks, etc.)
        if (ORIGIN_EXEMPT_PATHS.some(p => path === p || path.startsWith(p + '/'))) {
          return '*';
        }

        // For API endpoints, check for mobile client indicators
        const userAgent = c.req.header('User-Agent') ?? '';
        const hasMobileIndicator =
          userAgent.includes('Expo') ||
          userAgent.includes('okhttp') ||
          userAgent.includes('Dalvik') ||
          userAgent.includes('CFNetwork') ||
          c.req.header('X-Mobile-Client') === 'true' ||
          c.req.header('Authorization')?.startsWith('Bearer ');

        // Allow mobile clients (they use Authorization header, not cookies)
        if (hasMobileIndicator) {
          return origins[0]; // Return first allowed origin for mobile
        }

        // In production, reject requests without origin for sensitive endpoints
        if (isProduction) {
          // Return null/false to reject - but cors middleware expects string
          // Instead, we return a non-matching origin which will fail CORS
          return 'https://invalid.origin.rejected';
        }

        // In development, allow for testing
        return origins[0];
      }

      // Check if origin is in the allowed list
      if (origins.includes(origin)) {
        return origin;
      }

      // Origin not allowed - return non-matching to fail CORS
      return 'https://invalid.origin.rejected';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Mobile-Client', 'X-Request-ID'],
    credentials: true,
    maxAge: 86400,
  });
}

// Default middleware for backward compatibility
export const corsMiddleware = createCorsMiddleware();
