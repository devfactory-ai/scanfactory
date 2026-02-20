/**
 * T040: Tests for Pipeline Engine
 * Tests rule execution, step sequencing, and error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineEngine } from '../engine';
import type { PipelineExecutionResult } from '../engine';
import { ruleRegistry } from '../registry';
import type { PipelineConfig, DocumentData, RuleStep, RuleResult, PipelineContext } from '../types';

// Mock D1 Database
const createMockDb = (rows: Record<string, unknown>[] = []) => {
  const mockStmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(rows[0] || null),
    all: vi.fn().mockResolvedValue({ results: rows }),
    run: vi.fn().mockResolvedValue({ success: true }),
  };

  return {
    prepare: vi.fn().mockReturnValue(mockStmt),
    batch: vi.fn().mockResolvedValue([]),
  } as unknown as D1Database;
};

// Test rule implementations
const successRule: RuleStep = {
  type: 'success_rule',
  async execute(doc, config): Promise<RuleResult> {
    return {
      success: true,
      computed: { processed: true, value: config.value || 'default' },
    };
  },
};

const anomalyRule: RuleStep = {
  type: 'anomaly_rule',
  async execute(): Promise<RuleResult> {
    return {
      success: true,
      anomalies: [
        { type: 'test_warning', message: 'Test warning', severity: 'warning' },
      ],
    };
  },
};

const errorRule: RuleStep = {
  type: 'error_rule',
  async execute(): Promise<RuleResult> {
    return {
      success: false,
      error: 'Simulated rule error',
    };
  },
};

const throwingRule: RuleStep = {
  type: 'throwing_rule',
  async execute(): Promise<RuleResult> {
    throw new Error('Unexpected exception');
  },
};

const chainedRule: RuleStep = {
  type: 'chained_rule',
  async execute(doc): Promise<RuleResult> {
    // This rule depends on computed data from previous step
    const previousValue = doc.computed_data.value as string | undefined;
    return {
      success: true,
      computed: { chained_result: `chained_${previousValue || 'none'}` },
    };
  },
};

const metadataRule: RuleStep = {
  type: 'metadata_rule',
  async execute(): Promise<RuleResult> {
    return {
      success: true,
      metadata: { source: 'test', timestamp: '2024-01-01' },
    };
  },
};

describe('PipelineEngine', () => {
  let engine: PipelineEngine;
  let mockDb: D1Database;

  beforeEach(() => {
    mockDb = createMockDb();
    engine = new PipelineEngine(mockDb);

    // Register test rules
    ruleRegistry.register('success_rule', successRule);
    ruleRegistry.register('anomaly_rule', anomalyRule);
    ruleRegistry.register('error_rule', errorRule);
    ruleRegistry.register('throwing_rule', throwingRule);
    ruleRegistry.register('chained_rule', chainedRule);
    ruleRegistry.register('metadata_rule', metadataRule);
  });

  describe('loadPipeline', () => {
    it('should load pipeline from database', async () => {
      const mockPipeline = {
        id: 'pipe_123',
        name: 'test_pipeline',
        display_name: 'Test Pipeline',
        ocr_schema: 'test_schema',
        rule_steps: JSON.stringify([{ name: 'step1', type: 'success_rule', config: {} }]),
        batch_config: JSON.stringify({ group_by: 'company', max_count: 100, max_days: 30 }),
        field_display: null,
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockPipeline),
      };
      mockDb.prepare = vi.fn().mockReturnValue(mockStmt);

      const result = await engine.loadPipeline('pipe_123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('pipe_123');
      expect(result?.name).toBe('test_pipeline');
      expect(result?.rule_steps).toHaveLength(1);
      expect(result?.rule_steps[0].type).toBe('success_rule');
    });

    it('should return null for non-existent pipeline', async () => {
      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };
      mockDb.prepare = vi.fn().mockReturnValue(mockStmt);

      const result = await engine.loadPipeline('non_existent');
      expect(result).toBeNull();
    });

    it('should parse field_display when present', async () => {
      const fieldDisplay = { groups: [{ name: 'main', label: 'Main', fields: ['field1'] }] };
      const mockPipeline = {
        id: 'pipe_123',
        name: 'test',
        display_name: 'Test',
        ocr_schema: 'test',
        rule_steps: '[]',
        batch_config: '{}',
        field_display: JSON.stringify(fieldDisplay),
      };

      const mockStmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockPipeline),
      };
      mockDb.prepare = vi.fn().mockReturnValue(mockStmt);

      const result = await engine.loadPipeline('pipe_123');
      expect(result?.field_display).toEqual(fieldDisplay);
    });
  });

  describe('execute', () => {
    const createDoc = (overrides: Partial<DocumentData> = {}): DocumentData => ({
      id: 'doc_123',
      pipeline_id: 'pipe_123',
      extracted_data: { field1: 'value1' },
      computed_data: {},
      anomalies: [],
      metadata: {},
      ...overrides,
    });

    const createPipeline = (steps: PipelineConfig['rule_steps'] = []): PipelineConfig => ({
      id: 'pipe_123',
      name: 'test_pipeline',
      display_name: 'Test Pipeline',
      ocr_schema: 'test',
      rule_steps: steps,
      batch_config: { group_by: 'company', max_count: 100, max_days: 30, export_template: 'csv' },
      field_display: null,
    });

    it('should execute single successful rule', async () => {
      const doc = createDoc();
      const pipeline = createPipeline([
        { name: 'step1', type: 'success_rule', config: { value: 'test_value' } },
      ]);

      const result = await engine.execute(doc, pipeline);

      expect(result.success).toBe(true);
      expect(result.computed_data.processed).toBe(true);
      expect(result.computed_data.value).toBe('test_value');
      expect(result.step_results).toHaveLength(1);
      expect(result.step_results[0].success).toBe(true);
    });

    it('should execute multiple rules in sequence', async () => {
      const doc = createDoc();
      const pipeline = createPipeline([
        { name: 'step1', type: 'success_rule', config: { value: 'first' } },
        { name: 'step2', type: 'chained_rule', config: {} },
      ]);

      const result = await engine.execute(doc, pipeline);

      expect(result.success).toBe(true);
      expect(result.computed_data.value).toBe('first');
      expect(result.computed_data.chained_result).toBe('chained_first');
      expect(result.step_results).toHaveLength(2);
    });

    it('should collect anomalies from rules', async () => {
      const doc = createDoc();
      const pipeline = createPipeline([
        { name: 'step1', type: 'anomaly_rule', config: {} },
      ]);

      const result = await engine.execute(doc, pipeline);

      expect(result.success).toBe(true);
      expect(result.anomalies).toHaveLength(1);
      expect(result.anomalies[0].type).toBe('test_warning');
      expect(result.anomalies[0].severity).toBe('warning');
    });

    it('should preserve existing anomalies', async () => {
      const doc = createDoc({
        anomalies: [{ type: 'existing', message: 'Pre-existing', severity: 'info' }],
      });
      const pipeline = createPipeline([
        { name: 'step1', type: 'anomaly_rule', config: {} },
      ]);

      const result = await engine.execute(doc, pipeline);

      expect(result.anomalies).toHaveLength(2);
      expect(result.anomalies[0].type).toBe('existing');
      expect(result.anomalies[1].type).toBe('test_warning');
    });

    it('should handle rule returning error (non-blocking)', async () => {
      const doc = createDoc();
      const pipeline = createPipeline([
        { name: 'step1', type: 'error_rule', config: {} },
        { name: 'step2', type: 'success_rule', config: { value: 'after_error' } },
      ]);

      const result = await engine.execute(doc, pipeline);

      // Pipeline continues despite error
      expect(result.step_results[0].success).toBe(false);
      expect(result.step_results[1].success).toBe(true);
      // Error is recorded as anomaly
      expect(result.anomalies.some((a) => a.type === 'rule_error')).toBe(true);
      // Subsequent step still executed
      expect(result.computed_data.value).toBe('after_error');
    });

    it('should handle rule throwing exception', async () => {
      const doc = createDoc();
      const pipeline = createPipeline([
        { name: 'step1', type: 'throwing_rule', config: {} },
      ]);

      const result = await engine.execute(doc, pipeline);

      expect(result.step_results[0].success).toBe(false);
      expect(result.step_results[0].error).toContain('Unexpected exception');
      expect(result.anomalies.some((a) => a.message.includes('Unexpected exception'))).toBe(true);
    });

    it('should handle unknown rule type', async () => {
      const doc = createDoc();
      const pipeline = createPipeline([
        { name: 'step1', type: 'non_existent_rule', config: {} },
      ]);

      const result = await engine.execute(doc, pipeline);

      expect(result.step_results[0].success).toBe(false);
      expect(result.step_results[0].error).toContain('Unknown rule type');
    });

    it('should merge metadata from rules', async () => {
      const doc = createDoc({ metadata: { initial: 'value' } });
      const pipeline = createPipeline([
        { name: 'step1', type: 'metadata_rule', config: {} },
      ]);

      const result = await engine.execute(doc, pipeline);

      expect(result.metadata.initial).toBe('value');
      expect(result.metadata.source).toBe('test');
      expect(result.metadata.timestamp).toBe('2024-01-01');
    });

    it('should track execution duration', async () => {
      const doc = createDoc();
      const pipeline = createPipeline([
        { name: 'step1', type: 'success_rule', config: {} },
      ]);

      const result = await engine.execute(doc, pipeline);

      expect(result.total_duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.step_results[0].duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty rule_steps', async () => {
      const doc = createDoc();
      const pipeline = createPipeline([]);

      const result = await engine.execute(doc, pipeline);

      expect(result.success).toBe(true);
      expect(result.step_results).toHaveLength(0);
      expect(result.computed_data).toEqual({});
    });

    it('should preserve computed_data from document', async () => {
      const doc = createDoc({
        computed_data: { pre_computed: 'value' },
      });
      const pipeline = createPipeline([
        { name: 'step1', type: 'success_rule', config: {} },
      ]);

      const result = await engine.execute(doc, pipeline);

      expect(result.computed_data.pre_computed).toBe('value');
      expect(result.computed_data.processed).toBe(true);
    });
  });
});

describe('RuleRegistry', () => {
  it('should register and retrieve rules', () => {
    const testRule: RuleStep = {
      type: 'test_registry',
      async execute(): Promise<RuleResult> {
        return { success: true };
      },
    };

    ruleRegistry.register('test_registry', testRule);
    expect(ruleRegistry.has('test_registry')).toBe(true);
    expect(ruleRegistry.get('test_registry')).toBe(testRule);
  });

  it('should list all registered rule types', () => {
    const types = ruleRegistry.listTypes();
    expect(types).toContain('success_rule');
    expect(types).toContain('anomaly_rule');
  });

  it('should return undefined for unregistered rule', () => {
    expect(ruleRegistry.get('unknown_type')).toBeUndefined();
    expect(ruleRegistry.has('unknown_type')).toBe(false);
  });
});
