import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors';
import { authRoutes } from './auth/routes';
import { extractionRoutes } from './core/extraction/routes';
import { validationRoutes } from './core/validation/routes';
import { errorHandler } from './lib/errors';
import { handleQueueMessage, type MessageBatch } from './core/pipeline/consumer';

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

// Document routes (protected)
app.route('/api/documents', extractionRoutes);

// Validation routes (protected)
app.route('/api/validation', validationRoutes);

// Admin routes for pipelines list (from extractionRoutes)
app.get('/api/admin/pipelines', async (c) => {
  const pipelines = await c.env.DB.prepare(
    'SELECT id, name, display_name, description FROM pipelines WHERE active = 1'
  ).all();
  return c.json({ pipelines: pipelines.results ?? [] });
});

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await handleQueueMessage(batch, env);
  },
};
