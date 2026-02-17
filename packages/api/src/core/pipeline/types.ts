export interface PipelineConfig {
  id: string;
  name: string;
  display_name: string;
  ocr_schema: string;
  rule_steps: RuleStepConfig[];
  batch_config: BatchConfig;
  field_display: FieldDisplayConfig | null;
}

export interface RuleStepConfig {
  name: string;
  type: string;
  config: Record<string, unknown>;
}

export interface BatchConfig {
  group_by: string;
  max_count: number;
  max_days: number;
  export_template: string;
}

export interface FieldDisplayConfig {
  groups: Array<{
    name: string;
    label: string;
    fields: string[];
  }>;
}

export interface DocumentData {
  id: string;
  pipeline_id: string;
  extracted_data: Record<string, unknown>;
  computed_data: Record<string, unknown>;
  anomalies: Anomaly[];
  metadata: Record<string, unknown>;
}

export interface Anomaly {
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  field?: string;
}

export interface RuleResult {
  success: boolean;
  computed?: Record<string, unknown>;
  anomalies?: Anomaly[];
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface PipelineContext {
  db: D1Database;
  pipeline: PipelineConfig;
  lookupCache: Map<string, unknown>;
}

export interface RuleStep {
  type: string;
  execute(
    doc: DocumentData,
    config: Record<string, unknown>,
    ctx: PipelineContext
  ): Promise<RuleResult>;
}
