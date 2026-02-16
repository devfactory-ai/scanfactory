import { Hono } from 'hono';

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

app.get('/', (c) => {
  return c.json({
    name: 'ScanFactory API',
    version: '1.0.0',
    status: 'ok'
  });
});

app.get('/api/health', (c) => {
  return c.json({ status: 'healthy' });
});

export default app;
