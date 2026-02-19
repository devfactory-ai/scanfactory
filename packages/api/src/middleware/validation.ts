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
 * Magic bytes signatures for file type validation
 * This prevents malicious files from being uploaded with spoofed MIME types
 */
const FILE_SIGNATURES: Record<string, { bytes: number[]; offset?: number; mime: string }[]> = {
  jpeg: [
    { bytes: [0xFF, 0xD8, 0xFF], mime: 'image/jpeg' },
  ],
  png: [
    { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], mime: 'image/png' },
  ],
  webp: [
    { bytes: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' }, // RIFF header
  ],
  pdf: [
    { bytes: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf' }, // %PDF
  ],
};

/**
 * Check if file bytes match a known signature
 */
function matchesSignature(bytes: Uint8Array, signature: { bytes: number[]; offset?: number }): boolean {
  const offset = signature.offset ?? 0;
  if (bytes.length < offset + signature.bytes.length) {
    return false;
  }
  return signature.bytes.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * Detect file type from magic bytes
 */
function detectFileType(bytes: Uint8Array): string | null {
  for (const [type, signatures] of Object.entries(FILE_SIGNATURES)) {
    for (const sig of signatures) {
      if (matchesSignature(bytes, sig)) {
        return sig.mime;
      }
    }
  }
  return null;
}

/**
 * Validate file upload with magic bytes verification
 * SEC-02: Validates file signature to prevent malicious file uploads
 */
export async function validateFileUpload(file: unknown): Promise<void> {
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

  // Minimum file size check (prevent empty files)
  if (blob.size < 100) {
    throw new ValidationError('Fichier trop petit ou vide');
  }

  // Read first 16 bytes for magic bytes validation
  const headerBuffer = await blob.slice(0, 16).arrayBuffer();
  const headerBytes = new Uint8Array(headerBuffer);

  // Detect actual file type from magic bytes
  const detectedType = detectFileType(headerBytes);

  if (!detectedType) {
    throw new ValidationError('Type de fichier non reconnu. Formats supportés: JPEG, PNG, WebP, PDF');
  }

  // Verify MIME type matches detected type (if provided)
  const declaredType = (blob as { type?: string }).type ?? '';
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

  if (!allowedTypes.includes(detectedType)) {
    throw new ValidationError(`Type de fichier non supporté: ${detectedType}`);
  }

  // Warn if declared type doesn't match detected type (potential spoofing attempt)
  if (declaredType && declaredType !== detectedType) {
    // Log potential spoofing but allow if detected type is valid
    console.log(JSON.stringify({
      type: 'security_warning',
      message: 'MIME type mismatch detected',
      declared: declaredType,
      detected: detectedType,
      timestamp: new Date().toISOString(),
    }));
  }
}

/**
 * Sync version for backward compatibility (basic validation only)
 * @deprecated Use async validateFileUpload instead
 */
export function validateFileUploadSync(file: unknown): asserts file is Blob {
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

  // Check type (basic validation - use async version for magic bytes)
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
