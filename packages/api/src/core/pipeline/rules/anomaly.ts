import type { RuleStep, DocumentData, RuleResult, PipelineContext, Anomaly } from '../types';
import { ruleRegistry } from '../registry';

interface AnomalyConfig {
  type: 'duplicate' | 'threshold' | 'pattern' | 'custom';
  fields?: string[];
  window_days?: number;
  threshold?: number;
  operator?: '>' | '<' | '>=' | '<=' | '==' | '!=';
  pattern?: string;
  message?: string;
  severity?: 'info' | 'warning' | 'error';
}

async function checkDuplicate(
  db: D1Database,
  doc: DocumentData,
  fields: string[],
  windowDays: number
): Promise<boolean> {
  if (fields.length === 0) return false;

  const data = { ...doc.extracted_data, ...doc.computed_data };

  // Build query conditions
  const conditions: string[] = ['id != ?', 'pipeline_id = ?'];
  const params: unknown[] = [doc.id, doc.pipeline_id];

  // Add time window
  if (windowDays > 0) {
    conditions.push(`created_at >= datetime('now', '-${windowDays} days')`);
  }

  // Add field conditions - check in extracted_data JSON
  for (const field of fields) {
    const value = data[field];
    if (value !== undefined && value !== null) {
      conditions.push(`json_extract(extracted_data, '$.${field}') = ?`);
      params.push(String(value));
    }
  }

  const query = `
    SELECT COUNT(*) as count FROM documents
    WHERE ${conditions.join(' AND ')}
  `;

  const result = await db.prepare(query).bind(...params).first<{ count: number }>();
  return (result?.count ?? 0) > 0;
}

function checkThreshold(
  data: Record<string, unknown>,
  field: string,
  threshold: number,
  operator: string
): boolean {
  const value = data[field];
  if (value === undefined || value === null) return false;

  const numValue = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(numValue)) return false;

  switch (operator) {
    case '>': return numValue > threshold;
    case '<': return numValue < threshold;
    case '>=': return numValue >= threshold;
    case '<=': return numValue <= threshold;
    case '==': return numValue === threshold;
    case '!=': return numValue !== threshold;
    default: return false;
  }
}

function checkPattern(
  data: Record<string, unknown>,
  field: string,
  pattern: string
): boolean {
  const value = data[field];
  if (value === undefined || value === null) return false;

  try {
    const regex = new RegExp(pattern);
    return regex.test(String(value));
  } catch {
    return false;
  }
}

const anomalyRule: RuleStep = {
  type: 'anomaly',

  async execute(
    doc: DocumentData,
    config: Record<string, unknown>,
    ctx: PipelineContext
  ): Promise<RuleResult> {
    const cfg = config as unknown as AnomalyConfig;
    const anomalies: Anomaly[] = [];
    const data = { ...doc.extracted_data, ...doc.computed_data };

    switch (cfg.type) {
      case 'duplicate': {
        const fields = cfg.fields ?? [];
        const windowDays = cfg.window_days ?? 30;

        const isDuplicate = await checkDuplicate(ctx.db, doc, fields, windowDays);

        if (isDuplicate) {
          anomalies.push({
            type: 'duplicate',
            message: cfg.message ?? `Document potentiellement en double (champs: ${fields.join(', ')})`,
            severity: cfg.severity ?? 'warning',
          });
        }
        break;
      }

      case 'threshold': {
        const field = cfg.fields?.[0];
        if (field && cfg.threshold !== undefined && cfg.operator) {
          const isAnomaly = checkThreshold(data, field, cfg.threshold, cfg.operator);

          if (isAnomaly) {
            anomalies.push({
              type: 'threshold',
              message: cfg.message ?? `Valeur anormale pour "${field}" (${cfg.operator} ${cfg.threshold})`,
              severity: cfg.severity ?? 'warning',
              field,
            });
          }
        }
        break;
      }

      case 'pattern': {
        const field = cfg.fields?.[0];
        if (field && cfg.pattern) {
          const matchesPattern = checkPattern(data, field, cfg.pattern);

          // Pattern match = anomaly (e.g., detecting suspicious patterns)
          if (matchesPattern) {
            anomalies.push({
              type: 'pattern',
              message: cfg.message ?? `Pattern suspect détecté dans "${field}"`,
              severity: cfg.severity ?? 'warning',
              field,
            });
          }
        }
        break;
      }

      case 'custom': {
        // Custom anomaly detection - placeholder for pipeline-specific logic
        // Could be extended with more complex rules
        break;
      }
    }

    return {
      success: true,
      anomalies: anomalies.length > 0 ? anomalies : undefined,
    };
  },
};

// Register the rule
ruleRegistry.register('anomaly', anomalyRule);

export { anomalyRule };
