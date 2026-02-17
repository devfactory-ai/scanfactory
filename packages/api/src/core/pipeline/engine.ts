import { ruleRegistry } from './registry';
import type {
  PipelineConfig,
  PipelineContext,
  DocumentData,
  RuleResult,
  Anomaly,
  RuleStepConfig,
} from './types';

export interface PipelineExecutionResult {
  success: boolean;
  computed_data: Record<string, unknown>;
  anomalies: Anomaly[];
  metadata: Record<string, unknown>;
  step_results: Array<{
    step_name: string;
    success: boolean;
    duration_ms: number;
    error?: string;
  }>;
  total_duration_ms: number;
}

export class PipelineEngine {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async loadPipeline(pipelineId: string): Promise<PipelineConfig | null> {
    const row = await this.db
      .prepare(
        `SELECT id, name, display_name, ocr_schema, rule_steps, batch_config, field_display
         FROM pipelines WHERE id = ? AND active = 1`
      )
      .bind(pipelineId)
      .first<{
        id: string;
        name: string;
        display_name: string;
        ocr_schema: string;
        rule_steps: string;
        batch_config: string;
        field_display: string | null;
      }>();

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      display_name: row.display_name,
      ocr_schema: row.ocr_schema,
      rule_steps: JSON.parse(row.rule_steps),
      batch_config: JSON.parse(row.batch_config),
      field_display: row.field_display ? JSON.parse(row.field_display) : null,
    };
  }

  async execute(
    doc: DocumentData,
    pipeline: PipelineConfig
  ): Promise<PipelineExecutionResult> {
    const startTime = Date.now();
    const stepResults: PipelineExecutionResult['step_results'] = [];
    const allComputed: Record<string, unknown> = { ...doc.computed_data };
    const allAnomalies: Anomaly[] = [...doc.anomalies];
    const allMetadata: Record<string, unknown> = { ...doc.metadata };

    const ctx: PipelineContext = {
      db: this.db,
      pipeline,
      lookupCache: new Map(),
    };

    let overallSuccess = true;

    for (const stepConfig of pipeline.rule_steps) {
      const stepStart = Date.now();
      const result = await this.executeStep(doc, stepConfig, ctx, allComputed);

      stepResults.push({
        step_name: stepConfig.name,
        success: result.success,
        duration_ms: Date.now() - stepStart,
        error: result.error,
      });

      if (result.success) {
        // Merge computed data
        if (result.computed) {
          Object.assign(allComputed, result.computed);
        }

        // Collect anomalies
        if (result.anomalies) {
          allAnomalies.push(...result.anomalies);
        }

        // Merge metadata
        if (result.metadata) {
          Object.assign(allMetadata, result.metadata);
        }

        // Update doc for next step
        doc = {
          ...doc,
          computed_data: allComputed,
          anomalies: allAnomalies,
          metadata: allMetadata,
        };
      } else {
        // Step failed but we continue (non-blocking)
        // Add error as anomaly
        allAnomalies.push({
          type: 'rule_error',
          message: `Rule "${stepConfig.name}" failed: ${result.error}`,
          severity: 'warning',
        });
      }
    }

    return {
      success: overallSuccess,
      computed_data: allComputed,
      anomalies: allAnomalies,
      metadata: allMetadata,
      step_results: stepResults,
      total_duration_ms: Date.now() - startTime,
    };
  }

  private async executeStep(
    doc: DocumentData,
    stepConfig: RuleStepConfig,
    ctx: PipelineContext,
    currentComputed: Record<string, unknown>
  ): Promise<RuleResult> {
    const rule = ruleRegistry.get(stepConfig.type);

    if (!rule) {
      return {
        success: false,
        error: `Unknown rule type: ${stepConfig.type}`,
      };
    }

    try {
      // Pass current computed data to the document for this step
      const docWithComputed = {
        ...doc,
        computed_data: currentComputed,
      };

      return await rule.execute(docWithComputed, stepConfig.config, ctx);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
