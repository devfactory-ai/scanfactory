import type { RuleStep, DocumentData, RuleResult, PipelineContext } from '../types';
import { ruleRegistry } from '../registry';

interface ComputeConfig {
  output_field: string;
  formula: string;
  type?: 'number' | 'string' | 'boolean';
}

function evaluateFormula(
  formula: string,
  data: Record<string, unknown>
): unknown {
  // Simple formula evaluation
  // Supports: field references, basic math, min/max functions

  // Replace field references with values
  let expression = formula;

  // Handle min(a, b, c) and max(a, b, c) functions
  expression = expression.replace(
    /min\(([^)]+)\)/g,
    (_, args: string) => {
      const values = args.split(',').map((arg) => {
        const trimmed = arg.trim();
        const val = data[trimmed];
        return val !== undefined ? parseFloat(String(val)) : parseFloat(trimmed);
      }).filter((v) => !isNaN(v));
      return values.length > 0 ? String(Math.min(...values)) : '0';
    }
  );

  expression = expression.replace(
    /max\(([^)]+)\)/g,
    (_, args: string) => {
      const values = args.split(',').map((arg) => {
        const trimmed = arg.trim();
        const val = data[trimmed];
        return val !== undefined ? parseFloat(String(val)) : parseFloat(trimmed);
      }).filter((v) => !isNaN(v));
      return values.length > 0 ? String(Math.max(...values)) : '0';
    }
  );

  // Handle round(value, decimals) function
  expression = expression.replace(
    /round\(([^,]+),\s*(\d+)\)/g,
    (_, value: string, decimals: string) => {
      const trimmed = value.trim();
      const val = data[trimmed] !== undefined ? parseFloat(String(data[trimmed])) : parseFloat(trimmed);
      const dec = parseInt(decimals, 10);
      return isNaN(val) ? '0' : val.toFixed(dec);
    }
  );

  // Replace field references
  for (const [key, value] of Object.entries(data)) {
    // Use word boundary to avoid partial matches
    const regex = new RegExp(`\\b${key}\\b`, 'g');
    const numValue = value !== undefined && value !== null
      ? (typeof value === 'number' ? value : parseFloat(String(value)))
      : 0;
    expression = expression.replace(regex, isNaN(numValue) ? '0' : String(numValue));
  }

  // Evaluate the expression safely (basic math only)
  try {
    // Only allow numbers, operators, parentheses, and spaces
    if (!/^[\d\s+\-*/.()]+$/.test(expression)) {
      return 0;
    }
    // Use Function constructor for safe math evaluation
    const result = new Function(`return ${expression}`)();
    return typeof result === 'number' && !isNaN(result) ? result : 0;
  } catch {
    return 0;
  }
}

const computeRule: RuleStep = {
  type: 'compute',

  async execute(
    doc: DocumentData,
    config: Record<string, unknown>,
    _ctx: PipelineContext
  ): Promise<RuleResult> {
    const cfg = config as unknown as ComputeConfig;
    const data = { ...doc.extracted_data, ...doc.computed_data };

    let result = evaluateFormula(cfg.formula, data);

    // Type conversion
    switch (cfg.type) {
      case 'number':
        result = typeof result === 'number' ? result : parseFloat(String(result)) || 0;
        break;
      case 'string':
        result = String(result);
        break;
      case 'boolean':
        result = Boolean(result);
        break;
    }

    return {
      success: true,
      computed: {
        [cfg.output_field]: result,
      },
    };
  },
};

// Register the rule
ruleRegistry.register('compute', computeRule);

export { computeRule };
