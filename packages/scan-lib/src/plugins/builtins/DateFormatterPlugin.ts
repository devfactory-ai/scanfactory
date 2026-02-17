/**
 * Date Formatter Plugin
 *
 * Normalizes date fields to ISO 8601 format (YYYY-MM-DD)
 * Handles various input formats commonly found in French documents
 */

import type { FieldTransformerPlugin } from '../types';
import type { FieldExtraction } from '../../types';

const DATE_PATTERNS = [
  // DD/MM/YYYY or DD-MM-YYYY
  {
    regex: /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
    format: (m: RegExpMatchArray) => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
  },
  // DD/MM/YY or DD-MM-YY
  {
    regex: /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/,
    format: (m: RegExpMatchArray) => {
      const year = parseInt(m[3]) > 50 ? `19${m[3]}` : `20${m[3]}`;
      return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    },
  },
  // DD month YYYY (French)
  {
    regex: /^(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})$/i,
    format: (m: RegExpMatchArray) => {
      const months: Record<string, string> = {
        janvier: '01', février: '02', mars: '03', avril: '04',
        mai: '05', juin: '06', juillet: '07', août: '08',
        septembre: '09', octobre: '10', novembre: '11', décembre: '12',
      };
      const month = months[m[2].toLowerCase()];
      return `${m[3]}-${month}-${m[1].padStart(2, '0')}`;
    },
  },
  // YYYY-MM-DD (already ISO)
  {
    regex: /^(\d{4})-(\d{2})-(\d{2})$/,
    format: (m: RegExpMatchArray) => m[0],
  },
];

interface DateFormatterOptions {
  /** Field names to transform (default: fields ending with _date) */
  targetFields?: string[];

  /** Output format (default: ISO 8601) */
  outputFormat?: 'iso' | 'french' | 'us';
}

/**
 * Create a date formatter plugin
 */
export function createDateFormatterPlugin(
  options: DateFormatterOptions = {}
): FieldTransformerPlugin {
  const targetFields = options.targetFields ?? ['*_date', 'date_*'];

  return {
    type: 'field-transformer',
    metadata: {
      id: 'scan-lib:date-formatter',
      name: 'Date Formatter',
      version: '1.0.0',
      description: 'Normalizes date fields to consistent format',
    },
    targetFields: targetFields.includes('*') ? ['*'] : targetFields,

    async transform(
      field: FieldExtraction,
      _allFields: FieldExtraction[]
    ): Promise<FieldExtraction> {
      // Check if this is a date field
      if (!isDateField(field.name, targetFields)) {
        return field;
      }

      const normalized = normalizeDate(field.value, options.outputFormat);

      if (normalized === field.value) {
        return field;
      }

      return {
        ...field,
        value: normalized,
        // Slightly increase confidence if normalization succeeded
        confidence: Math.min(1, field.confidence + 0.05),
      };
    },
  };
}

function isDateField(fieldName: string, patterns: string[]): boolean {
  const name = fieldName.toLowerCase();

  for (const pattern of patterns) {
    if (pattern === '*') return true;

    if (pattern.startsWith('*')) {
      if (name.endsWith(pattern.slice(1))) return true;
    } else if (pattern.endsWith('*')) {
      if (name.startsWith(pattern.slice(0, -1))) return true;
    } else {
      if (name === pattern.toLowerCase()) return true;
    }
  }

  // Check common date field names
  return (
    name.includes('date') ||
    name.includes('_at') ||
    name === 'created' ||
    name === 'updated' ||
    name === 'expires' ||
    name === 'valid_until'
  );
}

function normalizeDate(
  value: string,
  outputFormat: 'iso' | 'french' | 'us' = 'iso'
): string {
  const trimmed = value.trim();

  // Try each pattern
  for (const pattern of DATE_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (match) {
      const isoDate = pattern.format(match);

      // Validate the date
      if (!isValidDate(isoDate)) {
        continue;
      }

      return formatOutput(isoDate, outputFormat);
    }
  }

  // Return original if no pattern matched
  return value;
}

function isValidDate(isoDate: string): boolean {
  const [year, month, day] = isoDate.split('-').map(Number);

  // Basic validation
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;

  // Check days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return false;

  return true;
}

function formatOutput(
  isoDate: string,
  format: 'iso' | 'french' | 'us'
): string {
  const [year, month, day] = isoDate.split('-');

  switch (format) {
    case 'french':
      return `${day}/${month}/${year}`;
    case 'us':
      return `${month}/${day}/${year}`;
    case 'iso':
    default:
      return isoDate;
  }
}
