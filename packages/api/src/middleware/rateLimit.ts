import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../index';

interface RateLimitConfig {
  /** Maximum requests per window */
  limit: number;
  /** Window size in seconds */
  windowSec: number;
  /** Key prefix for KV storage */
  keyPrefix?: string;
}

interface RateLimitInfo {
  count: number;
  resetAt: number;
}

/**
 * Rate limiting middleware using Cloudflare KV
 *
 * Implements sliding window rate limiting to protect against brute force attacks.
 * Uses client IP as identifier.
 */
export function createRateLimitMiddleware(config: RateLimitConfig): MiddlewareHandler<{ Bindings: Env }> {
  const { limit, windowSec, keyPrefix = 'ratelimit' } = config;

  return async (c: Context<{ Bindings: Env }>, next) => {
    const ip = getClientIP(c);
    const key = `${keyPrefix}:${ip}`;

    try {
      // Get current rate limit info from KV
      const stored = await c.env.CACHE.get(key);
      const now = Date.now();
      let info: RateLimitInfo;

      if (stored) {
        info = JSON.parse(stored) as RateLimitInfo;

        // Check if window has expired
        if (now >= info.resetAt) {
          info = { count: 0, resetAt: now + windowSec * 1000 };
        }
      } else {
        info = { count: 0, resetAt: now + windowSec * 1000 };
      }

      // Increment counter
      info.count++;

      // Calculate remaining requests and reset time
      const remaining = Math.max(0, limit - info.count);
      const resetInSec = Math.ceil((info.resetAt - now) / 1000);

      // Set rate limit headers
      c.header('X-RateLimit-Limit', String(limit));
      c.header('X-RateLimit-Remaining', String(remaining));
      c.header('X-RateLimit-Reset', String(resetInSec));

      // Check if over limit
      if (info.count > limit) {
        c.header('Retry-After', String(resetInSec));
        return c.json(
          {
            error: 'Too many requests',
            message: `Rate limit exceeded. Try again in ${resetInSec} seconds.`,
            retryAfter: resetInSec,
          },
          429
        );
      }

      // Store updated info (with TTL matching window)
      await c.env.CACHE.put(key, JSON.stringify(info), {
        expirationTtl: windowSec + 60, // Add buffer for clock skew
      });

      await next();
    } catch (error) {
      // On KV error, allow request through (fail open)
      console.error('Rate limit error:', error);
      await next();
    }
  };
}

/**
 * Extract client IP from request
 */
function getClientIP(c: Context): string {
  // Cloudflare provides the real client IP
  const cfIP = c.req.header('CF-Connecting-IP');
  if (cfIP) return cfIP;

  // Fallback for local dev
  const forwarded = c.req.header('X-Forwarded-For');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return 'unknown';
}

// Pre-configured rate limiters for common use cases

/** Auth endpoints: 5 requests per minute (brute force protection) */
export const authRateLimit = createRateLimitMiddleware({
  limit: 5,
  windowSec: 60,
  keyPrefix: 'rl:auth',
});

/** API endpoints: 100 requests per minute */
export const apiRateLimit = createRateLimitMiddleware({
  limit: 100,
  windowSec: 60,
  keyPrefix: 'rl:api',
});

/** Upload endpoints: 20 requests per minute */
export const uploadRateLimit = createRateLimitMiddleware({
  limit: 20,
  windowSec: 60,
  keyPrefix: 'rl:upload',
});
