import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createRateLimitMiddleware } from '../rateLimit';

// Mock KV store
function createMockKV() {
  const store = new Map<string, { value: string; expiration?: number }>();

  return {
    get: vi.fn(async (key: string) => {
      const item = store.get(key);
      if (!item) return null;
      if (item.expiration && Date.now() > item.expiration) {
        store.delete(key);
        return null;
      }
      return item.value;
    }),
    put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
      const expiration = options?.expirationTtl
        ? Date.now() + options.expirationTtl * 1000
        : undefined;
      store.set(key, { value, expiration });
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _clear: () => store.clear(),
    _store: store,
  };
}

describe('rateLimit', () => {
  let mockKV: ReturnType<typeof createMockKV>;
  let app: Hono;

  beforeEach(() => {
    mockKV = createMockKV();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createRateLimitMiddleware', () => {
    it('should allow requests under the limit', async () => {
      app = new Hono();
      const rateLimit = createRateLimitMiddleware({
        limit: 5,
        windowSec: 60,
      });

      app.use('*', (c, next) => {
        c.env = { CACHE: mockKV };
        return next();
      });
      app.use('*', rateLimit);
      app.get('/test', (c) => c.json({ ok: true }));

      // Make 5 requests (should all succeed)
      for (let i = 0; i < 5; i++) {
        const res = await app.request('/test', {
          headers: { 'CF-Connecting-IP': '1.2.3.4' },
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('X-RateLimit-Remaining')).toBe(String(4 - i));
      }
    });

    it('should block requests over the limit', async () => {
      app = new Hono();
      const rateLimit = createRateLimitMiddleware({
        limit: 3,
        windowSec: 60,
      });

      app.use('*', (c, next) => {
        c.env = { CACHE: mockKV };
        return next();
      });
      app.use('*', rateLimit);
      app.get('/test', (c) => c.json({ ok: true }));

      // Make 3 requests (should succeed)
      for (let i = 0; i < 3; i++) {
        const res = await app.request('/test', {
          headers: { 'CF-Connecting-IP': '1.2.3.4' },
        });
        expect(res.status).toBe(200);
      }

      // 4th request should be blocked
      const res = await app.request('/test', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });
      expect(res.status).toBe(429);

      const body = await res.json() as { error: string };
      expect(body.error).toBe('Too many requests');
      expect(res.headers.get('Retry-After')).toBeDefined();
    });

    it('should track different IPs separately', async () => {
      app = new Hono();
      const rateLimit = createRateLimitMiddleware({
        limit: 2,
        windowSec: 60,
      });

      app.use('*', (c, next) => {
        c.env = { CACHE: mockKV };
        return next();
      });
      app.use('*', rateLimit);
      app.get('/test', (c) => c.json({ ok: true }));

      // IP 1: 2 requests
      for (let i = 0; i < 2; i++) {
        const res = await app.request('/test', {
          headers: { 'CF-Connecting-IP': '1.1.1.1' },
        });
        expect(res.status).toBe(200);
      }

      // IP 2: 2 requests (should also succeed)
      for (let i = 0; i < 2; i++) {
        const res = await app.request('/test', {
          headers: { 'CF-Connecting-IP': '2.2.2.2' },
        });
        expect(res.status).toBe(200);
      }

      // IP 1: 3rd request should be blocked
      const blocked1 = await app.request('/test', {
        headers: { 'CF-Connecting-IP': '1.1.1.1' },
      });
      expect(blocked1.status).toBe(429);

      // IP 2: 3rd request should also be blocked
      const blocked2 = await app.request('/test', {
        headers: { 'CF-Connecting-IP': '2.2.2.2' },
      });
      expect(blocked2.status).toBe(429);
    });

    it('should reset after window expires', async () => {
      app = new Hono();
      const rateLimit = createRateLimitMiddleware({
        limit: 2,
        windowSec: 60,
      });

      app.use('*', (c, next) => {
        c.env = { CACHE: mockKV };
        return next();
      });
      app.use('*', rateLimit);
      app.get('/test', (c) => c.json({ ok: true }));

      // Use up the limit
      for (let i = 0; i < 2; i++) {
        await app.request('/test', {
          headers: { 'CF-Connecting-IP': '1.2.3.4' },
        });
      }

      // Should be blocked
      let res = await app.request('/test', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });
      expect(res.status).toBe(429);

      // Advance time past the window
      vi.advanceTimersByTime(61 * 1000);

      // Should be allowed again
      res = await app.request('/test', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });
      expect(res.status).toBe(200);
    });

    it('should include correct rate limit headers', async () => {
      app = new Hono();
      const rateLimit = createRateLimitMiddleware({
        limit: 10,
        windowSec: 60,
      });

      app.use('*', (c, next) => {
        c.env = { CACHE: mockKV };
        return next();
      });
      app.use('*', rateLimit);
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('/test', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');
      expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('should use X-Forwarded-For as fallback', async () => {
      app = new Hono();
      const rateLimit = createRateLimitMiddleware({
        limit: 2,
        windowSec: 60,
      });

      app.use('*', (c, next) => {
        c.env = { CACHE: mockKV };
        return next();
      });
      app.use('*', rateLimit);
      app.get('/test', (c) => c.json({ ok: true }));

      // Request without CF-Connecting-IP but with X-Forwarded-For
      const res = await app.request('/test', {
        headers: { 'X-Forwarded-For': '5.6.7.8, 9.10.11.12' },
      });
      expect(res.status).toBe(200);

      // Check it used the first IP from X-Forwarded-For
      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining('5.6.7.8'),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should use custom key prefix', async () => {
      app = new Hono();
      const rateLimit = createRateLimitMiddleware({
        limit: 5,
        windowSec: 60,
        keyPrefix: 'custom:prefix',
      });

      app.use('*', (c, next) => {
        c.env = { CACHE: mockKV };
        return next();
      });
      app.use('*', rateLimit);
      app.get('/test', (c) => c.json({ ok: true }));

      await app.request('/test', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining('custom:prefix'),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should fail open on KV error', async () => {
      const errorKV = {
        get: vi.fn().mockRejectedValue(new Error('KV error')),
        put: vi.fn().mockRejectedValue(new Error('KV error')),
      };

      app = new Hono();
      const rateLimit = createRateLimitMiddleware({
        limit: 1,
        windowSec: 60,
      });

      app.use('*', (c, next) => {
        c.env = { CACHE: errorKV };
        return next();
      });
      app.use('*', rateLimit);
      app.get('/test', (c) => c.json({ ok: true }));

      // Should still succeed even though KV fails (fail open)
      const res = await app.request('/test', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });
      expect(res.status).toBe(200);
    });
  });
});
