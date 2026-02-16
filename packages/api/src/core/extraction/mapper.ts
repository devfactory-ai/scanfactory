import type { ExtractionResult, FieldExtraction } from './adapter';

export interface Pipeline {
  id: string;
  name: string;
  display_name: string;
  ocr_schema: string;
  rule_steps: string;
  batch_config: string;
  field_display: string | null;
}

export interface MappedDocument {
  extractedData: Record<string, unknown>;
  confidenceScore: number;
  extractionModes: {
    replace: string[];
    table: string[];
    direct: string[];
  };
  rawOcrData: unknown;
  fieldConfidences: Record<string, number>;
}

// Date formats commonly found in Tunisian documents
const DATE_PATTERNS = [
  /(\d{2})\/(\d{2})\/(\d{4})/, // DD/MM/YYYY
  /(\d{2})-(\d{2})-(\d{4})/, // DD-MM-YYYY
  /(\d{2})\.(\d{2})\.(\d{4})/, // DD.MM.YYYY
  /(\d{4})\/(\d{2})\/(\d{2})/, // YYYY/MM/DD
  /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD (ISO)
];

function normalizeDate(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  for (const pattern of DATE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      if (pattern.source.startsWith('(\\d{4})')) {
        // YYYY/MM/DD or YYYY-MM-DD format
        const [, year, month, day] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      } else {
        // DD/MM/YYYY or similar format
        const [, day, month, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }

  return null;
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }

  if (typeof value === 'string') {
    // Handle Tunisian/French number format (1 234,56)
    const cleaned = value
      .trim()
      .replace(/\s/g, '') // Remove spaces
      .replace(/,/g, '.'); // Replace comma with dot

    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  return null;
}

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'string') {
    return value.trim();
  }

  return String(value).trim();
}

function cleanArray<T>(arr: T[]): T[] {
  return arr.filter((item) => item !== null && item !== undefined && item !== '');
}

function inferFieldType(fieldName: string, value: unknown): 'date' | 'number' | 'string' | 'array' {
  // Field name based inference
  const lowerName = fieldName.toLowerCase();

  if (
    lowerName.includes('date') ||
    lowerName.includes('_at') ||
    lowerName.includes('birthdate') ||
    lowerName.includes('valid_from') ||
    lowerName.includes('valid_to')
  ) {
    return 'date';
  }

  if (
    lowerName.includes('amount') ||
    lowerName.includes('price') ||
    lowerName.includes('total') ||
    lowerName.includes('rate') ||
    lowerName.includes('quantity') ||
    lowerName.includes('montant') ||
    lowerName.includes('prix')
  ) {
    return 'number';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  // Value based inference
  if (typeof value === 'number') {
    return 'number';
  }

  if (typeof value === 'string') {
    // Check if it looks like a date
    for (const pattern of DATE_PATTERNS) {
      if (pattern.test(value.trim())) {
        return 'date';
      }
    }

    // Check if it looks like a number
    const numberPattern = /^[\d\s,.\-]+$/;
    if (numberPattern.test(value.trim()) && !isNaN(parseFloat(value.replace(/[,\s]/g, '')))) {
      return 'number';
    }
  }

  return 'string';
}

function normalizeFieldValue(
  fieldName: string,
  extraction: FieldExtraction
): unknown {
  const { value } = extraction;
  const fieldType = inferFieldType(fieldName, value);

  switch (fieldType) {
    case 'date': {
      const normalized = normalizeDate(value);
      return normalized ?? normalizeString(value);
    }
    case 'number': {
      const normalized = normalizeNumber(value);
      return normalized ?? normalizeString(value);
    }
    case 'array': {
      if (Array.isArray(value)) {
        return cleanArray(value.map((item) => normalizeString(item)));
      }
      return value;
    }
    default:
      return normalizeString(value);
  }
}

export function mapOCRToDocument(
  ocrResult: ExtractionResult,
  pipeline: Pipeline
): MappedDocument {
  const extractedData: Record<string, unknown> = {};
  const fieldConfidences: Record<string, number> = {};

  // Map regular fields
  for (const [fieldName, extraction] of Object.entries(ocrResult.fields)) {
    extractedData[fieldName] = normalizeFieldValue(fieldName, extraction);
    fieldConfidences[fieldName] = extraction.confidence;
  }

  // Map table data
  if (ocrResult.tables && ocrResult.tables.length > 0) {
    for (const table of ocrResult.tables) {
      extractedData[table.name] = table.rows.map((row) => {
        const normalizedRow: Record<string, unknown> = {};
        for (const [fieldName, extraction] of Object.entries(row)) {
          normalizedRow[fieldName] = normalizeFieldValue(fieldName, extraction);
          // Track confidence for table fields with composite key
          fieldConfidences[`${table.name}.${fieldName}`] = extraction.confidence;
        }
        return normalizedRow;
      });
    }
  }

  return {
    extractedData,
    confidenceScore: ocrResult.overallConfidence,
    extractionModes: ocrResult.extractionModes,
    rawOcrData: ocrResult.rawResponse,
    fieldConfidences,
  };
}
