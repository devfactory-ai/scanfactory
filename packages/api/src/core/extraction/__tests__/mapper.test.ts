/**
 * T039: Tests for extraction mapper
 * Tests date normalization, number normalization, and field type inference
 */

import { describe, it, expect } from 'vitest';
import { mapOCRToDocument } from '../mapper';
import type { ExtractionResult } from '../adapter';
import type { Pipeline } from '../mapper';

const mockPipeline: Pipeline = {
  id: 'pipe_test',
  name: 'test_pipeline',
  display_name: 'Test Pipeline',
  ocr_schema: 'test_schema',
  rule_steps: '[]',
  batch_config: '{}',
  field_display: null,
};

describe('mapOCRToDocument', () => {
  describe('date normalization', () => {
    it('should normalize DD/MM/YYYY format to ISO', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          care_date: { value: '15/03/2024', confidence: 0.95 },
        },
        overallConfidence: 0.95,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.care_date).toBe('2024-03-15');
    });

    it('should normalize DD-MM-YYYY format to ISO', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          birth_date: { value: '01-12-1985', confidence: 0.9 },
        },
        overallConfidence: 0.9,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.birth_date).toBe('1985-12-01');
    });

    it('should normalize DD.MM.YYYY format to ISO', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          valid_from: { value: '05.07.2023', confidence: 0.88 },
        },
        overallConfidence: 0.88,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.valid_from).toBe('2023-07-05');
    });

    it('should keep ISO format unchanged', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          created_at: { value: '2024-01-15', confidence: 0.99 },
        },
        overallConfidence: 0.99,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.created_at).toBe('2024-01-15');
    });

    it('should handle YYYY/MM/DD format', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          issue_date: { value: '2024/03/15', confidence: 0.92 },
        },
        overallConfidence: 0.92,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.issue_date).toBe('2024-03-15');
    });

    it('should return original string for invalid date', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          care_date: { value: 'invalid date', confidence: 0.5 },
        },
        overallConfidence: 0.5,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.care_date).toBe('invalid date');
    });
  });

  describe('number normalization', () => {
    it('should parse standard number', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          invoiced_amount: { value: '150.50', confidence: 0.95 },
        },
        overallConfidence: 0.95,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.invoiced_amount).toBe(150.5);
    });

    it('should parse French/Tunisian format (comma decimal)', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          total_price: { value: '1 234,56', confidence: 0.9 },
        },
        overallConfidence: 0.9,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.total_price).toBe(1234.56);
    });

    it('should handle numeric values directly', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          quantity: { value: 5, confidence: 0.99 },
        },
        overallConfidence: 0.99,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.quantity).toBe(5);
    });

    it('should return string for non-numeric value in amount field', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          invoiced_amount: { value: 'N/A', confidence: 0.3 },
        },
        overallConfidence: 0.3,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.invoiced_amount).toBe('N/A');
    });
  });

  describe('string normalization', () => {
    it('should trim whitespace', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          patient_name: { value: '  Jean Dupont  ', confidence: 0.95 },
        },
        overallConfidence: 0.95,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.patient_name).toBe('Jean Dupont');
    });

    it('should convert null/undefined to empty string', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          notes: { value: null as unknown as string, confidence: 0 },
        },
        overallConfidence: 0,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.notes).toBe('');
    });
  });

  describe('array handling', () => {
    it('should normalize array elements', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          tags: { value: ['  tag1  ', 'tag2', '  tag3'], confidence: 0.9 },
        },
        overallConfidence: 0.9,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should filter out empty values from arrays', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          items: { value: ['item1', '', null, 'item2'], confidence: 0.85 },
        },
        overallConfidence: 0.85,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.items).toEqual(['item1', 'item2']);
    });
  });

  describe('table data mapping', () => {
    it('should map table rows with normalization', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {},
        tables: [
          {
            name: 'medications',
            rows: [
              {
                name: { value: '  Doliprane  ', confidence: 0.95 },
                quantity: { value: '2', confidence: 0.9 },
                price: { value: '15,50', confidence: 0.88 },
              },
              {
                name: { value: 'Aspirine', confidence: 0.92 },
                quantity: { value: '1', confidence: 0.95 },
                price: { value: '8,00', confidence: 0.9 },
              },
            ],
          },
        ],
        overallConfidence: 0.9,
        extractionModes: { replace: [], table: ['medications'], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      const medications = result.extractedData.medications as Array<Record<string, unknown>>;

      expect(medications).toHaveLength(2);
      expect(medications[0].name).toBe('Doliprane');
      expect(medications[0].price).toBe(15.5);
      expect(medications[1].name).toBe('Aspirine');
      expect(medications[1].price).toBe(8);
    });

    it('should track table field confidences', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {},
        tables: [
          {
            name: 'items',
            rows: [
              {
                description: { value: 'Item 1', confidence: 0.88 },
              },
            ],
          },
        ],
        overallConfidence: 0.88,
        extractionModes: { replace: [], table: ['items'], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.fieldConfidences['items.description']).toBe(0.88);
    });
  });

  describe('confidence tracking', () => {
    it('should track field confidences', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          field1: { value: 'value1', confidence: 0.95 },
          field2: { value: 'value2', confidence: 0.85 },
        },
        overallConfidence: 0.9,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.fieldConfidences.field1).toBe(0.95);
      expect(result.fieldConfidences.field2).toBe(0.85);
      expect(result.confidenceScore).toBe(0.9);
    });
  });

  describe('extraction modes', () => {
    it('should preserve extraction modes', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {},
        overallConfidence: 0.9,
        extractionModes: {
          replace: ['field1', 'field2'],
          table: ['medications'],
          direct: ['field3'],
        },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractionModes.replace).toEqual(['field1', 'field2']);
      expect(result.extractionModes.table).toEqual(['medications']);
      expect(result.extractionModes.direct).toEqual(['field3']);
    });
  });

  describe('field type inference', () => {
    it('should infer date type from field name containing "date"', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          some_date_field: { value: '15/03/2024', confidence: 0.9 },
        },
        overallConfidence: 0.9,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.some_date_field).toBe('2024-03-15');
    });

    it('should infer number type from field name containing "amount"', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          total_amount_due: { value: '100,50', confidence: 0.9 },
        },
        overallConfidence: 0.9,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.total_amount_due).toBe(100.5);
    });

    it('should infer number type from field name containing "montant" (French)', () => {
      const ocrResult: ExtractionResult = {
        success: true,
        schema: 'test',
        fields: {
          montant_facture: { value: '250,00', confidence: 0.92 },
        },
        overallConfidence: 0.92,
        extractionModes: { replace: [], table: [], direct: [] },
      };

      const result = mapOCRToDocument(ocrResult, mockPipeline);
      expect(result.extractedData.montant_facture).toBe(250);
    });
  });
});
