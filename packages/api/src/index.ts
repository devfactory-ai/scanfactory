import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors';
import { authRoutes } from './auth/routes';
import { errorHandler } from './lib/errors';

// Type definitions for Cloudflare bindings
export interface Env {
  DB: D1Database;
  SCANS: R2Bucket;
  EXPORTS: R2Bucket;
  CACHE: KVNamespace;
  DOC_QUEUE: Queue;
  OCR_API_URL: string;
  OCR_API_KEY: string;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', corsMiddleware);

// Error handling
app.onError(errorHandler);

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'ScanFactory API',
    version: '1.0.0',
    status: 'ok',
  });
});

app.get('/api/health', (c) => {
  return c.json({ status: 'healthy' });
});

// Auth routes (public)
app.route('/api/auth', authRoutes);

export default app;
