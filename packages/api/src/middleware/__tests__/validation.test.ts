import { describe, it, expect } from 'vitest';
import {
  validatePagination,
  validateNumericRange,
  validateFileUpload,
  validateUUID,
  validateStringArray,
  safeJsonParse,
  LIMITS,
} from '../validation';
import { ValidationError } from '../../lib/errors';

describe('validation', () => {
  describe('validatePagination', () => {
    it('should return defaults when no values provided', () => {
      const result = validatePagination(undefined, undefined);
      expect(result.limit).toBe(LIMITS.QUERY_LIMIT_DEFAULT);
      expect(result.offset).toBe(0);
    });

    it('should parse valid limit and offset', () => {
      const result = validatePagination('25', '50');
      expect(result.limit).toBe(25);
      expect(result.offset).toBe(50);
    });

    it('should cap limit at maximum', () => {
      const result = validatePagination('500', '0');
      expect(result.limit).toBe(LIMITS.QUERY_LIMIT_MAX);
    });

    it('should use default for invalid limit', () => {
      const result = validatePagination('invalid', '0');
      expect(result.limit).toBe(LIMITS.QUERY_LIMIT_DEFAULT);
    });

    it('should use default for negative limit', () => {
      const result = validatePagination('-5', '0');
      expect(result.limit).toBe(LIMITS.QUERY_LIMIT_DEFAULT);
    });

    it('should use 0 for invalid offset', () => {
      const result = validatePagination('10', 'invalid');
      expect(result.offset).toBe(0);
    });

    it('should use 0 for negative offset', () => {
      const result = validatePagination('10', '-10');
      expect(result.offset).toBe(0);
    });

    it('should throw for offset exceeding maximum', () => {
      expect(() => validatePagination('10', '20000')).toThrow(ValidationError);
    });
  });

  describe('validateNumericRange', () => {
    it('should return undefined for empty value', () => {
      expect(validateNumericRange(undefined, 0, 100, 'test')).toBeUndefined();
      expect(validateNumericRange('', 0, 100, 'test')).toBeUndefined();
    });

    it('should parse valid number in range', () => {
      expect(validateNumericRange('50', 0, 100, 'test')).toBe(50);
      expect(validateNumericRange('0.5', 0, 1, 'confidence')).toBe(0.5);
    });

    it('should throw for non-numeric value', () => {
      expect(() => validateNumericRange('abc', 0, 100, 'test')).toThrow(ValidationError);
    });

    it('should throw for value below minimum', () => {
      expect(() => validateNumericRange('-5', 0, 100, 'test')).toThrow(ValidationError);
    });

    it('should throw for value above maximum', () => {
      expect(() => validateNumericRange('150', 0, 100, 'test')).toThrow(ValidationError);
    });

    it('should accept boundary values', () => {
      expect(validateNumericRange('0', 0, 100, 'test')).toBe(0);
      expect(validateNumericRange('100', 0, 100, 'test')).toBe(100);
    });
  });

  describe('validateFileUpload', () => {
    it('should throw for null file', () => {
      expect(() => validateFileUpload(null)).toThrow(ValidationError);
    });

    it('should throw for undefined file', () => {
      expect(() => validateFileUpload(undefined)).toThrow(ValidationError);
    });

    it('should throw for string file', () => {
      expect(() => validateFileUpload('string')).toThrow(ValidationError);
    });

    it('should throw for file exceeding size limit', () => {
      const largeFile = {
        size: LIMITS.UPLOAD_SIZE_MAX + 1,
        type: 'image/jpeg',
      };
      expect(() => validateFileUpload(largeFile)).toThrow(ValidationError);
      expect(() => validateFileUpload(largeFile)).toThrow(/trop volumineux/);
    });

    it('should throw for unsupported file type', () => {
      const invalidFile = {
        size: 1000,
        type: 'application/x-executable',
      };
      expect(() => validateFileUpload(invalidFile)).toThrow(ValidationError);
      expect(() => validateFileUpload(invalidFile)).toThrow(/non supporté/);
    });

    it('should accept valid image files', () => {
      const jpegFile = { size: 1000, type: 'image/jpeg' };
      const pngFile = { size: 1000, type: 'image/png' };
      const webpFile = { size: 1000, type: 'image/webp' };
      const pdfFile = { size: 1000, type: 'application/pdf' };

      expect(() => validateFileUpload(jpegFile)).not.toThrow();
      expect(() => validateFileUpload(pngFile)).not.toThrow();
      expect(() => validateFileUpload(webpFile)).not.toThrow();
      expect(() => validateFileUpload(pdfFile)).not.toThrow();
    });

    it('should accept file without type (empty type)', () => {
      const noTypeFile = { size: 1000, type: '' };
      expect(() => validateFileUpload(noTypeFile)).not.toThrow();
    });
  });

  describe('validateUUID', () => {
    it('should accept valid UUID', () => {
      expect(() =>
        validateUUID('123e4567-e89b-12d3-a456-426614174000', 'id')
      ).not.toThrow();
    });

    it('should accept valid ULID', () => {
      expect(() =>
        validateUUID('01ARZ3NDEKTSV4RRFFQ69G5FAV', 'id')
      ).not.toThrow();
    });

    it('should accept prefixed ULID', () => {
      expect(() =>
        validateUUID('doc_01ARZ3NDEKTSV4RRFFQ69G5FAV', 'id')
      ).not.toThrow();
      expect(() =>
        validateUUID('batch_01ARZ3NDEKTSV4RRFFQ69G5FAV', 'id')
      ).not.toThrow();
    });

    it('should throw for invalid format', () => {
      expect(() => validateUUID('invalid', 'id')).toThrow(ValidationError);
      expect(() => validateUUID('12345', 'id')).toThrow(ValidationError);
      expect(() => validateUUID('', 'id')).toThrow(ValidationError);
    });
  });

  describe('validateStringArray', () => {
    it('should accept valid string array', () => {
      const result = validateStringArray(['a', 'b', 'c'], 'items', 10);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should throw for non-array', () => {
      expect(() => validateStringArray('string', 'items', 10)).toThrow(ValidationError);
      expect(() => validateStringArray(123, 'items', 10)).toThrow(ValidationError);
      expect(() => validateStringArray(null, 'items', 10)).toThrow(ValidationError);
    });

    it('should throw for empty array', () => {
      expect(() => validateStringArray([], 'items', 10)).toThrow(ValidationError);
    });

    it('should throw for array exceeding max length', () => {
      const longArray = Array(11).fill('item');
      expect(() => validateStringArray(longArray, 'items', 10)).toThrow(ValidationError);
    });

    it('should throw for array with non-string elements', () => {
      expect(() => validateStringArray(['a', 1, 'b'], 'items', 10)).toThrow(ValidationError);
      expect(() => validateStringArray(['a', null, 'b'], 'items', 10)).toThrow(ValidationError);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      expect(safeJsonParse('{"a": 1}', {})).toEqual({ a: 1 });
      expect(safeJsonParse('[1, 2, 3]', [])).toEqual([1, 2, 3]);
      expect(safeJsonParse('"string"', '')).toBe('string');
      expect(safeJsonParse('123', 0)).toBe(123);
      expect(safeJsonParse('null', {})).toBe(null);
    });

    it('should return default for invalid JSON', () => {
      expect(safeJsonParse('invalid', { default: true })).toEqual({ default: true });
      expect(safeJsonParse('{broken', [])).toEqual([]);
      expect(safeJsonParse('', null)).toBe(null);
    });

    it('should return default for undefined-like values', () => {
      expect(safeJsonParse('undefined', {})).toEqual({});
    });
  });

  describe('LIMITS constants', () => {
    it('should have reasonable default values', () => {
      expect(LIMITS.QUERY_LIMIT_MAX).toBe(100);
      expect(LIMITS.QUERY_LIMIT_DEFAULT).toBe(50);
      expect(LIMITS.QUERY_OFFSET_MAX).toBe(10000);
      expect(LIMITS.UPLOAD_SIZE_MAX).toBe(10 * 1024 * 1024); // 10MB
      expect(LIMITS.BATCH_DOCUMENTS_MAX).toBe(20);
    });
  });
});
