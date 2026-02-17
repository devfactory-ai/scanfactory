import type { RuleStep } from './types';

class RuleRegistry {
  private rules: Map<string, RuleStep> = new Map();

  register(type: string, rule: RuleStep): void {
    if (this.rules.has(type)) {
      console.warn(`Rule type "${type}" is being overwritten`);
    }
    this.rules.set(type, rule);
  }

  get(type: string): RuleStep | undefined {
    return this.rules.get(type);
  }

  has(type: string): boolean {
    return this.rules.has(type);
  }

  getAll(): Map<string, RuleStep> {
    return new Map(this.rules);
  }

  listTypes(): string[] {
    return Array.from(this.rules.keys());
  }
}

// Singleton instance
export const ruleRegistry = new RuleRegistry();
