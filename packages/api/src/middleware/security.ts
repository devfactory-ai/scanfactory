/**
 * Security Headers Middleware
 *
 * Adds security headers including Content Security Policy (CSP)
 * to protect against XSS, clickjacking, and other attacks.
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../index';

interface SecurityHeadersConfig {
  /** Environment - determines strictness of headers */
  environment?: 'development' | 'staging' | 'production';
  /** Additional allowed script sources */
  scriptSrc?: string[];
  /** Additional allowed style sources */
  styleSrc?: string[];
  /** Additional allowed image sources */
  imgSrc?: string[];
  /** Additional allowed connect sources (API, WebSocket) */
  connectSrc?: string[];
  /** Report URI for CSP violations */
  reportUri?: string;
}

/**
 * Create security headers middleware
 */
export function securityHeaders(config: SecurityHeadersConfig = {}): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    await next();

    const isProduction = (config.environment ?? c.env.ENVIRONMENT) === 'production';

    // Base CSP directives
    const scriptSrc = ["'self'", ...(config.scriptSrc ?? [])];
    const styleSrc = ["'self'", "'unsafe-inline'", ...(config.styleSrc ?? [])]; // unsafe-inline needed for some CSS-in-JS
    const imgSrc = ["'self'", 'data:', 'blob:', ...(config.imgSrc ?? [])];
    const connectSrc = [
      "'self'",
      // Allow Modal OCR
      'https://*.modal.run',
      // Allow Cloudflare services
      'https://*.cloudflare.com',
      'https://*.workers.dev',
      ...(config.connectSrc ?? []),
    ];

    // Build CSP header
    const cspDirectives = [
      "default-src 'self'",
      `script-src ${scriptSrc.join(' ')}`,
      `style-src ${styleSrc.join(' ')}`,
      `img-src ${imgSrc.join(' ')}`,
      `connect-src ${connectSrc.join(' ')}`,
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ];

    // Add report-uri if configured
    if (config.reportUri) {
      cspDirectives.push(`report-uri ${config.reportUri}`);
    }

    const csp = cspDirectives.join('; ');

    // Set security headers
    c.header('Content-Security-Policy', csp);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('X-XSS-Protection', '1; mode=block');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // HSTS only in production
    if (isProduction) {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
  };
}

/**
 * Default security headers middleware
 */
export const defaultSecurityHeaders = securityHeaders();
