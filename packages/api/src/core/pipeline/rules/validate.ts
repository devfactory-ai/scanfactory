import type { RuleStep, DocumentData, RuleResult, PipelineContext, Anomaly } from '../types';
import { ruleRegistry } from '../registry';

interface ValidationRule {
  field: string;
  type: 'required' | 'format' | 'range' | 'enum' | 'custom';
  params?: Record<string, unknown>;
  message?: string;
  severity?: 'info' | 'warning' | 'error';
}

interface ValidateConfig {
  rules: ValidationRule[];
}

function validateRequired(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

function validateFormat(value: unknown, format: string): boolean {
  if (!value) return true; // Skip empty values (use required for mandatory)

  const strValue = String(value);

  switch (format) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue);
    case 'phone':
      return /^[+]?[\d\s-]{8,}$/.test(strValue);
    case 'cin':
      // Tunisian CIN: 8 digits
      return /^\d{8}$/.test(strValue);
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(strValue);
    case 'number':
      return !isNaN(parseFloat(strValue));
    case 'positive':
      return !isNaN(parseFloat(strValue)) && parseFloat(strValue) > 0;
    default:
      // Treat as regex
      try {
        return new RegExp(format).test(strValue);
      } catch {
        return false;
      }
  }
}

function validateRange(value: unknown, min?: number, max?: number): boolean {
  if (value === null || value === undefined) return true;

  const numValue = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(numValue)) return false;

  if (min !== undefined && numValue < min) return false;
  if (max !== undefined && numValue > max) return false;

  return true;
}

function validateEnum(value: unknown, allowedValues: unknown[]): boolean {
  if (value === null || value === undefined) return true;
  return allowedValues.includes(value);
}

const validateRule: RuleStep = {
  type: 'validate',

  async execute(
    doc: DocumentData,
    config: Record<string, unknown>,
    _ctx: PipelineContext
  ): Promise<RuleResult> {
    const cfg = config as unknown as ValidateConfig;
    const anomalies: Anomaly[] = [];
    const data = { ...doc.extracted_data, ...doc.computed_data };

    for (const rule of cfg.rules) {
      const value = data[rule.field];
      let isValid = true;
      let defaultMessage = '';

      switch (rule.type) {
        case 'required':
          isValid = validateRequired(value);
          defaultMessage = `Le champ "${rule.field}" est requis`;
          break;

        case 'format':
          isValid = validateFormat(value, rule.params?.format as string);
          defaultMessage = `Le champ "${rule.field}" a un format invalide`;
          break;

        case 'range':
          isValid = validateRange(
            value,
            rule.params?.min as number | undefined,
            rule.params?.max as number | undefined
          );
          defaultMessage = `Le champ "${rule.field}" est hors limites`;
          break;

        case 'enum':
          isValid = validateEnum(value, rule.params?.values as unknown[]);
          defaultMessage = `Le champ "${rule.field}" a une valeur non autorisée`;
          break;

        case 'custom':
          // Custom validation via expression (simple)
          const expression = rule.params?.expression as string;
          if (expression) {
            try {
              // Very simple expression evaluation
              // Only supports: field > value, field < value, field == value
              const match = expression.match(/(\w+)\s*(>|<|>=|<=|==|!=)\s*(.+)/);
              if (match) {
                const [, fieldName, operator, compareValue] = match;
                const fieldVal = data[fieldName];
                const numFieldVal = parseFloat(String(fieldVal));
                const numCompareVal = parseFloat(compareValue);

                switch (operator) {
                  case '>': isValid = numFieldVal > numCompareVal; break;
                  case '<': isValid = numFieldVal < numCompareVal; break;
                  case '>=': isValid = numFieldVal >= numCompareVal; break;
                  case '<=': isValid = numFieldVal <= numCompareVal; break;
                  case '==': isValid = String(fieldVal) === compareValue.trim(); break;
                  case '!=': isValid = String(fieldVal) !== compareValue.trim(); break;
                }
              }
            } catch {
              isValid = false;
            }
          }
          defaultMessage = `Validation personnalisée échouée pour "${rule.field}"`;
          break;
      }

      if (!isValid) {
        anomalies.push({
          type: `validation_${rule.type}`,
          message: rule.message ?? defaultMessage,
          severity: rule.severity ?? 'warning',
          field: rule.field,
        });
      }
    }

    return {
      success: true,
      anomalies: anomalies.length > 0 ? anomalies : undefined,
    };
  },
};

// Register the rule
ruleRegistry.register('validate', validateRule);

export { validateRule };
