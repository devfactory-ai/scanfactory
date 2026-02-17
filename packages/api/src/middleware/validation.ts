import type { Context, MiddlewareHandler } from 'hono';
import { ValidationError } from '../lib/errors';

/**
 * Input validation utilities and middleware
 */

// Constants for validation limits
export const LIMITS = {
  QUERY_LIMIT_MAX: 100,
  QUERY_LIMIT_DEFAULT: 50,
  QUERY_OFFSET_MAX: 10000,
  UPLOAD_SIZE_MAX: 10 * 1024 * 1024, // 10MB
  BATCH_DOCUMENTS_MAX: 20,
  STRING_LENGTH_MAX: 1000,
} as const;

/**
 * Validate and sanitize pagination params
 */
export function validatePagination(
  limitStr: string | undefined,
  offsetStr: string | undefined
): { limit: number; offset: number } {
  let limit = parseInt(limitStr ?? String(LIMITS.QUERY_LIMIT_DEFAULT), 10);
  let offset = parseInt(offsetStr ?? '0', 10);

  // Validate limit
  if (isNaN(limit) || limit < 1) {
    limit = LIMITS.QUERY_LIMIT_DEFAULT;
  } else if (limit > LIMITS.QUERY_LIMIT_MAX) {
    limit = LIMITS.QUERY_LIMIT_MAX;
  }

  // Validate offset
  if (isNaN(offset) || offset < 0) {
    offset = 0;
  } else if (offset > LIMITS.QUERY_OFFSET_MAX) {
    throw new ValidationError(`Offset maximum: ${LIMITS.QUERY_OFFSET_MAX}`);
  }

  return { limit, offset };
}

/**
 * Validate numeric range
 */
export function validateNumericRange(
  value: string | undefined,
  min: number,
  max: number,
  fieldName: string
): number | undefined {
  if (!value) return undefined;

  const num = parseFloat(value);
  if (isNaN(num)) {
    throw new ValidationError(`${fieldName} doit être un nombre`);
  }
  if (num < min || num > max) {
    throw new ValidationError(`${fieldName} doit être entre ${min} et ${max}`);
  }

  return num;
}

/**
 * Validate file upload
 */
export function validateFileUpload(file: unknown): asserts file is Blob {
  if (!file || typeof file === 'string') {
    throw new ValidationError('Fichier requis');
  }

  const blob = file as Blob;

  // Check size
  if (blob.size > LIMITS.UPLOAD_SIZE_MAX) {
    throw new ValidationError(
      `Fichier trop volumineux. Maximum: ${LIMITS.UPLOAD_SIZE_MAX / 1024 / 1024}MB`
    );
  }

  // Check type (basic validation)
  const type = (blob as { type?: string }).type ?? '';
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (type && !allowedTypes.includes(type)) {
    throw new ValidationError(`Type de fichier non supporté: ${type}`);
  }
}

/**
 * Validate UUID format
 */
export function validateUUID(value: string, fieldName: string): void {
  // ULID or UUID format
  const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const prefixedPattern = /^[a-z]+_[0-9A-HJKMNP-TV-Z]{26}$/i;

  if (!ulidPattern.test(value) && !uuidPattern.test(value) && !prefixedPattern.test(value)) {
    throw new ValidationError(`${fieldName}: format invalide`);
  }
}

/**
 * Validate string array
 */
export function validateStringArray(
  value: unknown,
  fieldName: string,
  maxLength: number
): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} doit être un tableau`);
  }

  if (value.length === 0) {
    throw new ValidationError(`${fieldName} ne peut pas être vide`);
  }

  if (value.length > maxLength) {
    throw new ValidationError(`${fieldName}: maximum ${maxLength} éléments`);
  }

  for (const item of value) {
    if (typeof item !== 'string') {
      throw new ValidationError(`${fieldName}: tous les éléments doivent être des chaînes`);
    }
  }

  return value as string[];
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Middleware to validate content-type for JSON requests
 */
export const validateJsonContent: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;
  const contentType = c.req.header('Content-Type');

  // Only check for methods that should have a body
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    if (contentType && !contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
      throw new ValidationError('Content-Type invalide');
    }
  }

  await next();
};

/**
 * Middleware to limit request body size
 */
export function createBodySizeLimit(maxSize: number): MiddlewareHandler {
  return async (c, next) => {
    const contentLength = c.req.header('Content-Length');

    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!isNaN(size) && size > maxSize) {
        throw new ValidationError(`Corps de requête trop volumineux. Maximum: ${maxSize / 1024 / 1024}MB`);
      }
    }

    await next();
  };
}
