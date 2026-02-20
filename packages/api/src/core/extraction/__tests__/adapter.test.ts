/**
 * T039: Tests for OCR Adapter
 * Tests API integration, retry logic, and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OCRAdapter } from '../adapter';
import type { ExtractionResult } from '../adapter';

// Mock environment
const mockEnv = {
  OCR_API_URL: 'https://api.ocr.test',
  OCR_API_KEY: 'test-api-key',
} as any;

// Mock fetch globally
const mockFetch = vi.fn();
(globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

describe('OCRAdapter', () => {
  let adapter: OCRAdapter;

  beforeEach(() => {
    adapter = new OCRAdapter(mockEnv);
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('successful extraction', () => {
    it('should return extraction result on success', async () => {
      const mockResponse = {
        success: true,
        data: {
          fields: {
            patient_name: { value: 'Jean Dupont', confidence: 0.95 },
            amount: { value: 150.5, confidence: 0.9 },
          },
          extraction_modes: {
            replace: ['patient_name'],
            table: [],
            direct: ['amount'],
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const image = new ArrayBuffer(1000);
      const result = await adapter.extract(image, 'bulletin_soin');

      expect(result.success).toBe(true);
      expect(result.schema).toBe('bulletin_soin');
      expect(result.fields.patient_name.value).toBe('Jean Dupont');
      expect(result.fields.patient_name.confidence).toBe(0.95);
      expect(result.fields.amount.value).toBe(150.5);
      expect(result.extractionModes.replace).toContain('patient_name');
    });

    it('should calculate overall confidence from field confidences', async () => {
      const mockResponse = {
        success: true,
        data: {
          fields: {
            field1: { value: 'a', confidence: 0.8 },
            field2: { value: 'b', confidence: 0.9 },
            field3: { value: 'c', confidence: 1.0 },
          },
          extraction_modes: { replace: [], table: [], direct: [] },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.extract(new ArrayBuffer(100), 'test');

      // Average: (0.8 + 0.9 + 1.0) / 3 = 0.9
      expect(result.overallConfidence).toBeCloseTo(0.9, 2);
    });

    it('should include bounding boxes when present', async () => {
      const mockResponse = {
        success: true,
        data: {
          fields: {
            amount: {
              value: 100,
              confidence: 0.95,
              bounding_box: { x: 10, y: 20, width: 100, height: 30 },
            },
          },
          extraction_modes: { replace: [], table: [], direct: [] },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.extract(new ArrayBuffer(100), 'test');

      expect(result.fields.amount.boundingBox).toEqual({
        x: 10,
        y: 20,
        width: 100,
        height: 30,
      });
    });

    it('should handle table data', async () => {
      const mockResponse = {
        success: true,
        data: {
          fields: {},
          tables: [
            {
              name: 'medications',
              rows: [
                {
                  name: { value: 'Doliprane', confidence: 0.9 },
                  price: { value: 5.5, confidence: 0.85 },
                },
                {
                  name: { value: 'Aspirine', confidence: 0.92 },
                  price: { value: 3.0, confidence: 0.88 },
                },
              ],
            },
          ],
          extraction_modes: { replace: [], table: ['medications'], direct: [] },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.extract(new ArrayBuffer(100), 'test');

      expect(result.tables).toHaveLength(1);
      expect(result.tables![0].name).toBe('medications');
      expect(result.tables![0].rows).toHaveLength(2);
      expect(result.tables![0].rows[0].name.value).toBe('Doliprane');
    });
  });

  describe('retry logic', () => {
    it('should retry on 5xx errors with exponential backoff', async () => {
      // First two calls fail with 500, third succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                fields: { test: { value: 'ok', confidence: 1 } },
                extraction_modes: { replace: [], table: [], direct: [] },
              },
            }),
        });

      const extractPromise = adapter.extract(new ArrayBuffer(100), 'test');

      // Advance timers for first retry (1000ms)
      await vi.advanceTimersByTimeAsync(1000);
      // Advance timers for second retry (2000ms)
      await vi.advanceTimersByTimeAsync(2000);

      const result = await extractPromise;

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 4xx client errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      const result = await adapter.extract(new ArrayBuffer(100), 'test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('400');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return error after max retries exceeded', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const extractPromise = adapter.extract(new ArrayBuffer(100), 'test');

      // Advance through all retry delays
      await vi.advanceTimersByTimeAsync(1000); // First retry
      await vi.advanceTimersByTimeAsync(2000); // Second retry

      const result = await extractPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('error handling', () => {
    it('should handle OCR API returning success: false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: 'Unable to process image',
          }),
      });

      const result = await adapter.extract(new ArrayBuffer(100), 'test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unable to process image');
      expect(result.fields).toEqual({});
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const extractPromise = adapter.extract(new ArrayBuffer(100), 'test');

      // Advance through retries
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      const result = await extractPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle missing data in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            // data is missing
          }),
      });

      const result = await adapter.extract(new ArrayBuffer(100), 'test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('OCR extraction failed');
    });
  });

  describe('request format', () => {
    it('should send correct request format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              fields: {},
              extraction_modes: { replace: [], table: [], direct: [] },
            },
          }),
      });

      const image = new ArrayBuffer(500);
      await adapter.extract(image, 'bulletin_soin');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ocr.test/extract',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key',
          },
        })
      );

      // Check that body is FormData
      const call = mockFetch.mock.calls[0];
      expect(call[1].body).toBeInstanceOf(FormData);
    });
  });

  describe('edge cases', () => {
    it('should handle empty fields response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              fields: {},
              extraction_modes: { replace: [], table: [], direct: [] },
            },
          }),
      });

      const result = await adapter.extract(new ArrayBuffer(100), 'test');

      expect(result.success).toBe(true);
      expect(result.fields).toEqual({});
      expect(result.overallConfidence).toBe(0);
    });

    it('should preserve raw response', async () => {
      const mockResponse = {
        success: true,
        data: {
          fields: { test: { value: 'ok', confidence: 1 } },
          extraction_modes: { replace: [], table: [], direct: [] },
        },
        debug_info: { processing_time: 1.5 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.extract(new ArrayBuffer(100), 'test');

      expect(result.rawResponse).toEqual(mockResponse);
    });
  });
});
