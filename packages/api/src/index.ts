import { Hono, type Context } from 'hono';
import { createCorsMiddleware } from './middleware/cors';
import { csrfProtection, csrfTokenEndpoint } from './middleware/csrf';
import { requestLogging } from './middleware/logging';
import { apiRateLimit, uploadRateLimit } from './middleware/rateLimit';
import { securityHeaders } from './middleware/security';
import { authRoutes } from './auth/routes';
import { extractionRoutes } from './core/extraction/routes';
import { validationRoutes } from './core/validation/routes';
import { batchRoutes } from './core/batches/routes';
import { adminRoutes } from './admin/routes';
import { dashboardRoutes } from './dashboard/routes';
import { errorHandler } from './lib/errors';
import { handleQueueMessage, type MessageBatch } from './core/pipeline/consumer';
import { handleScheduledBatchClosure } from './core/batches/cron';

// Type definitions for Cloudflare bindings
export interface Env {
  DB: D1Database;
  SCANS: R2Bucket;
  EXPORTS: R2Bucket;
  CACHE: KVNamespace;
  DOC_QUEUE: Queue;
  AI: Ai; // Cloudflare Workers AI
  OCR_API_URL: string;
  OCR_API_KEY: string;
  JWT_SECRET: string;
  MODAL_OCR_URL?: string; // Modal OCR service URL
  USE_MODAL_OCR?: string; // 'true' to use Modal OCR service
  MODAL_HMAC_SECRET?: string; // HMAC secret for Modal authentication
  ALLOWED_ORIGINS?: string; // Comma-separated list of allowed CORS origins
  ENVIRONMENT?: 'development' | 'staging' | 'production';
}

const app = new Hono<{ Bindings: Env }>();

// Request logging and tracing (must be first to capture all requests)
app.use('*', requestLogging());

// Validate required secrets at startup (fail fast)
app.use('*', async (c, next) => {
  // SEC-05: Validate JWT_SECRET in production
  if (c.env.ENVIRONMENT === 'production') {
    if (!c.env.JWT_SECRET || c.env.JWT_SECRET.length < 32) {
      console.error(JSON.stringify({
        type: 'security_error',
        message: 'JWT_SECRET must be set and at least 32 characters in production',
        timestamp: new Date().toISOString(),
      }));
      return c.json({ error: 'Server configuration error' }, 500);
    }
  }
  await next();
});

// Global middleware - CORS with environment-based origins
app.use('*', async (c, next) => {
  const isProduction = c.env.ENVIRONMENT === 'production';
  const corsHandler = createCorsMiddleware(c.env.ALLOWED_ORIGINS, isProduction);
  return corsHandler(c, next);
});

// SEC-07: Security headers (CSP, X-Frame-Options, etc.)
app.use('*', async (c, next) => {
  const secHeaders = securityHeaders({ environment: c.env.ENVIRONMENT });
  return secHeaders(c, next);
});

// Error handling
app.onError(errorHandler);

// CSRF protection for state-changing operations
app.use('/api/*', async (c, next) => {
  // Parse allowed origins from env
  const allowedOrigins = c.env.ALLOWED_ORIGINS
    ? c.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];

  const csrfHandler = csrfProtection({
    allowedOrigins,
    skipPaths: [
      /^\/api\/auth\/login$/,    // Allow login without CSRF (uses OTP)
      /^\/api\/auth\/otp/,       // Allow OTP endpoints
      /^\/api\/health$/,         // Health check
      /^\/api\/csrf-token$/,     // CSRF token endpoint
    ],
  });

  return csrfHandler(c, next);
});

// CSRF token endpoint for SPAs
app.get('/api/csrf-token', csrfTokenEndpoint());

// SEC-04: Global rate limiting for all API endpoints
// 100 requests per minute per IP (except auth which has stricter limits)
app.use('/api/*', async (c, next) => {
  // Skip rate limiting for health checks
  if (c.req.path === '/api/health' || c.req.path === '/api/version') {
    return next();
  }
  // Skip for auth routes (they have their own stricter limits)
  if (c.req.path.startsWith('/api/auth') || c.req.path.startsWith('/api/v1/auth')) {
    return next();
  }
  return apiRateLimit(c, next);
});

// Stricter rate limiting for upload endpoints
app.use('/api/*/documents', uploadRateLimit);
app.use('/api/documents', uploadRateLimit);

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'ScanFactory API',
    version: '1.0.0',
    status: 'ok',
  });
});

app.get('/api/health', async (c) => {
  const checks: Record<string, { status: 'ok' | 'error'; latency_ms?: number; error?: string }> = {};
  let allHealthy = true;

  // Check D1 Database
  const dbStart = Date.now();
  try {
    await c.env.DB.prepare('SELECT 1').first();
    checks.database = { status: 'ok', latency_ms: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      status: 'error',
      latency_ms: Date.now() - dbStart,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    allHealthy = false;
  }

  // Check KV Cache
  const kvStart = Date.now();
  try {
    const testKey = '__health_check__';
    await c.env.CACHE.put(testKey, 'ok', { expirationTtl: 60 });
    const value = await c.env.CACHE.get(testKey);
    if (value !== 'ok') {
      throw new Error('KV read/write mismatch');
    }
    checks.cache = { status: 'ok', latency_ms: Date.now() - kvStart };
  } catch (error) {
    checks.cache = {
      status: 'error',
      latency_ms: Date.now() - kvStart,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    allHealthy = false;
  }

  // Check R2 Bucket (list operation, low cost)
  const r2Start = Date.now();
  try {
    await c.env.SCANS.list({ limit: 1 });
    checks.storage = { status: 'ok', latency_ms: Date.now() - r2Start };
  } catch (error) {
    checks.storage = {
      status: 'error',
      latency_ms: Date.now() - r2Start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    allHealthy = false;
  }

  const response = {
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    checks,
  };

  return c.json(response, allHealthy ? 200 : 503);
});

// =============================================================================
// API v1 Routes
// =============================================================================

// Auth routes (public)
app.route('/api/v1/auth', authRoutes);
app.route('/api/auth', authRoutes); // Backward compatibility

// Document routes (protected)
app.route('/api/v1/documents', extractionRoutes);
app.route('/api/documents', extractionRoutes); // Backward compatibility

// Validation routes (protected)
app.route('/api/v1/validation', validationRoutes);
app.route('/api/validation', validationRoutes); // Backward compatibility

// Batch routes (protected, admin mutations)
app.route('/api/v1/batches', batchRoutes);
app.route('/api/batches', batchRoutes); // Backward compatibility

// Admin routes (protected, admin only)
app.route('/api/v1/admin', adminRoutes);
app.route('/api/admin', adminRoutes); // Backward compatibility

// Dashboard routes (protected)
app.route('/api/v1/dashboard', dashboardRoutes);
app.route('/api/dashboard', dashboardRoutes); // Backward compatibility

// API version info endpoint
app.get('/api/version', (c) => {
  return c.json({
    current_version: 'v1',
    supported_versions: ['v1'],
    deprecation_policy: 'Versions are supported for 12 months after deprecation notice',
  });
});

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await handleQueueMessage(batch, env);
  },
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    await handleScheduledBatchClosure(env);
  },
};
