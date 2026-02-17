/**
 * Plugin System Exports
 */

// Types
export type {
  Plugin,
  PluginMetadata,
  PluginContext,
  PluginLogger,
  PluginType,
  ScanLibPlugin,
  OCRAdapterPlugin,
  OCRAdapterOptions,
  ImageProcessorPlugin,
  ImageProcessorOptions,
  QualityValidatorPlugin,
  QualityValidationResult,
  PluginQualityIssue,
  PostProcessorPlugin,
  PostProcessorOptions,
  FieldTransformerPlugin,
  FieldTransformerOptions,
} from './types';

// Registry
export {
  PluginRegistry,
  getPluginRegistry,
  resetPluginRegistry,
} from './PluginRegistry';

// Executor
export {
  PluginExecutor,
  getPluginExecutor,
  createPluginExecutor,
} from './PluginExecutor';

// Built-in plugins
export { createDateFormatterPlugin } from './builtins/DateFormatterPlugin';
export { createAmountNormalizerPlugin } from './builtins/AmountNormalizerPlugin';
