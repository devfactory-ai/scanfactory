/**
 * Amount Normalizer Plugin
 *
 * Normalizes monetary amounts to a consistent format
 * Handles French number formats (1 234,56 €) and various currency symbols
 */

import type { FieldTransformerPlugin } from '../types';
import type { FieldExtraction } from '../../types';

interface AmountNormalizerOptions {
  /** Field names to transform (default: fields with 'amount', 'total', 'price') */
  targetFields?: string[];

  /** Output decimal separator (default: '.') */
  decimalSeparator?: '.' | ',';

  /** Output thousands separator (default: none) */
  thousandsSeparator?: '' | ' ' | ',' | '.';

  /** Number of decimal places (default: 2) */
  decimalPlaces?: number;

  /** Include currency symbol in output (default: false) */
  includeCurrency?: boolean;

  /** Default currency if none detected (default: EUR) */
  defaultCurrency?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  '€': 'EUR',
  '$': 'USD',
  '£': 'GBP',
  '¥': 'JPY',
  'CHF': 'CHF',
};

/**
 * Create an amount normalizer plugin
 */
export function createAmountNormalizerPlugin(
  options: AmountNormalizerOptions = {}
): FieldTransformerPlugin {
  const targetFields = options.targetFields ?? [
    '*amount*',
    '*total*',
    '*price*',
    '*montant*',
    '*prix*',
    'ttc',
    'ht',
    'tva',
  ];

  return {
    type: 'field-transformer',
    metadata: {
      id: 'scan-lib:amount-normalizer',
      name: 'Amount Normalizer',
      version: '1.0.0',
      description: 'Normalizes monetary amounts to consistent format',
    },
    targetFields: targetFields.includes('*') ? ['*'] : targetFields,

    async transform(
      field: FieldExtraction,
      _allFields: FieldExtraction[]
    ): Promise<FieldExtraction> {
      // Check if this is an amount field
      if (!isAmountField(field.name, targetFields)) {
        return field;
      }

      const result = normalizeAmount(field.value, options);

      if (!result) {
        return field;
      }

      return {
        ...field,
        value: result.formatted,
        // Slightly increase confidence if normalization succeeded
        confidence: Math.min(1, field.confidence + 0.05),
      };
    },
  };
}

function isAmountField(fieldName: string, patterns: string[]): boolean {
  const name = fieldName.toLowerCase();

  for (const pattern of patterns) {
    if (pattern === '*') return true;

    // Handle wildcard patterns
    if (pattern.includes('*')) {
      const parts = pattern.split('*');
      let matches = true;
      let lastIndex = 0;

      for (const part of parts) {
        if (!part) continue;
        const index = name.indexOf(part.toLowerCase(), lastIndex);
        if (index === -1) {
          matches = false;
          break;
        }
        lastIndex = index + part.length;
      }

      if (matches) return true;
    } else {
      if (name === pattern.toLowerCase()) return true;
    }
  }

  return false;
}

interface NormalizedAmount {
  value: number;
  currency: string | null;
  formatted: string;
}

function normalizeAmount(
  value: string,
  options: AmountNormalizerOptions
): NormalizedAmount | null {
  const {
    decimalSeparator = '.',
    thousandsSeparator = '',
    decimalPlaces = 2,
    includeCurrency = false,
    defaultCurrency = 'EUR',
  } = options;

  let text = value.trim();

  // Extract currency symbol
  let currency: string | null = null;
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) {
      currency = code;
      text = text.replace(symbol, '').trim();
      break;
    }
  }

  // Handle French format: "1 234,56" or "1.234,56"
  // Handle US format: "1,234.56"
  // Handle plain: "1234.56"

  // Remove spaces
  text = text.replace(/\s/g, '');

  // Determine format by looking at separators
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  let numericValue: number;

  if (lastComma > lastDot) {
    // French format: comma is decimal separator
    // Remove dots (thousands) and replace comma with dot
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // US/International format: dot is decimal separator
    // Remove commas (thousands)
    text = text.replace(/,/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    // Only comma present - could be decimal or thousands
    // Check position: if 3 digits after comma, it's thousands; else decimal
    const afterComma = text.substring(lastComma + 1);
    if (afterComma.length === 3 && /^\d+$/.test(afterComma)) {
      // Thousands separator
      text = text.replace(',', '');
    } else {
      // Decimal separator
      text = text.replace(',', '.');
    }
  }

  // Parse the number
  numericValue = parseFloat(text);

  if (isNaN(numericValue)) {
    return null;
  }

  // Format the output
  const formatted = formatAmount(
    numericValue,
    decimalSeparator,
    thousandsSeparator,
    decimalPlaces,
    includeCurrency ? (currency ?? defaultCurrency) : null
  );

  return {
    value: numericValue,
    currency: currency ?? defaultCurrency,
    formatted,
  };
}

function formatAmount(
  value: number,
  decimalSep: string,
  thousandsSep: string,
  decimals: number,
  currency: string | null
): string {
  // Round to decimal places
  const rounded = value.toFixed(decimals);

  // Split integer and decimal parts
  const [intPart, decPart] = rounded.split('.');

  // Add thousands separator
  let formattedInt = intPart;
  if (thousandsSep) {
    formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep);
  }

  // Combine with decimal separator
  let result = decPart ? `${formattedInt}${decimalSep}${decPart}` : formattedInt;

  // Add currency if requested
  if (currency) {
    const symbol = Object.entries(CURRENCY_SYMBOLS).find(
      ([, code]) => code === currency
    )?.[0];

    if (symbol === '€') {
      result = `${result} €`;
    } else if (symbol) {
      result = `${symbol}${result}`;
    } else {
      result = `${result} ${currency}`;
    }
  }

  return result;
}
