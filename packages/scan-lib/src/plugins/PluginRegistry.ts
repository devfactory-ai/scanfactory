/**
 * Plugin Registry for scan-lib
 *
 * Central registry for managing plugins with lifecycle hooks,
 * dependency resolution, and type-safe access.
 */

import type {
  Plugin,
  PluginContext,
  PluginLogger,
  PluginMetadata,
  PluginType,
  ScanLibPlugin,
  OCRAdapterPlugin,
  ImageProcessorPlugin,
  QualityValidatorPlugin,
  PostProcessorPlugin,
  FieldTransformerPlugin,
} from './types';

// ============================================================================
// Plugin Registry
// ============================================================================

export class PluginRegistry {
  private plugins = new Map<string, ScanLibPlugin>();
  private initialized = new Set<string>();
  private context: PluginContext;
  private config: Record<string, unknown>;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
    this.context = this.createContext();
  }

  // --------------------------------------------------------------------------
  // Registration
  // --------------------------------------------------------------------------

  /**
   * Register a plugin
   */
  async register(plugin: ScanLibPlugin): Promise<void> {
    const { id } = plugin.metadata;

    if (this.plugins.has(id)) {
      throw new Error(`Plugin "${id}" is already registered`);
    }

    this.validatePlugin(plugin);
    this.plugins.set(id, plugin);

    // Initialize if registry is already active
    if (this.initialized.size > 0) {
      await this.initializePlugin(plugin);
    }
  }

  /**
   * Register multiple plugins
   */
  async registerAll(plugins: ScanLibPlugin[]): Promise<void> {
    for (const plugin of plugins) {
      await this.register(plugin);
    }
  }

  /**
   * Unregister a plugin
   */
  async unregister(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return;
    }

    // Dispose plugin
    if (plugin.dispose) {
      try {
        await plugin.dispose();
      } catch (error) {
        this.context.logger.error(`Failed to dispose plugin "${pluginId}"`, error);
      }
    }

    this.plugins.delete(pluginId);
    this.initialized.delete(pluginId);
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Initialize all registered plugins
   */
  async initializeAll(): Promise<void> {
    const plugins = Array.from(this.plugins.values());

    // Sort by initialization order (optional)
    plugins.sort((a, b) => {
      const orderA = (a as ImageProcessorPlugin).order ?? 0;
      const orderB = (b as ImageProcessorPlugin).order ?? 0;
      return orderA - orderB;
    });

    for (const plugin of plugins) {
      await this.initializePlugin(plugin);
    }
  }

  /**
   * Dispose all plugins
   */
  async disposeAll(): Promise<void> {
    const plugins = Array.from(this.plugins.values()).reverse();

    for (const plugin of plugins) {
      if (plugin.dispose) {
        try {
          await plugin.dispose();
        } catch (error) {
          this.context.logger.error(
            `Failed to dispose plugin "${plugin.metadata.id}"`,
            error
          );
        }
      }
    }

    this.plugins.clear();
    this.initialized.clear();
  }

  // --------------------------------------------------------------------------
  // Query
  // --------------------------------------------------------------------------

  /**
   * Get a plugin by ID
   */
  get<T extends ScanLibPlugin>(id: string): T | undefined {
    return this.plugins.get(id) as T | undefined;
  }

  /**
   * Check if a plugin is registered
   */
  has(id: string): boolean {
    return this.plugins.has(id);
  }

  /**
   * Get all plugins of a specific type
   */
  getByType<T extends PluginType>(
    type: T
  ): Array<Extract<ScanLibPlugin, { type: T }>> {
    return Array.from(this.plugins.values())
      .filter((p) => p.type === type)
      .sort((a, b) => {
        const orderA = (a as ImageProcessorPlugin).order ?? 0;
        const orderB = (b as ImageProcessorPlugin).order ?? 0;
        return orderA - orderB;
      }) as Array<Extract<ScanLibPlugin, { type: T }>>;
  }

  /**
   * Get all OCR adapters
   */
  getOCRAdapters(): OCRAdapterPlugin[] {
    return this.getByType('ocr-adapter').sort((a, b) => {
      return (b.priority ?? 0) - (a.priority ?? 0);
    });
  }

  /**
   * Get all image processors for a stage
   */
  getImageProcessors(stage: 'pre-ocr' | 'post-capture'): ImageProcessorPlugin[] {
    return this.getByType('image-processor').filter((p) => p.stage === stage);
  }

  /**
   * Get all quality validators
   */
  getQualityValidators(): QualityValidatorPlugin[] {
    return this.getByType('quality-validator');
  }

  /**
   * Get all post-processors
   */
  getPostProcessors(): PostProcessorPlugin[] {
    return this.getByType('post-processor');
  }

  /**
   * Get field transformers for a field
   */
  getFieldTransformers(fieldName: string): FieldTransformerPlugin[] {
    return this.getByType('field-transformer').filter((p) =>
      p.targetFields.includes(fieldName) || p.targetFields.includes('*')
    );
  }

  /**
   * Get all plugin metadata
   */
  getPluginList(): PluginMetadata[] {
    return Array.from(this.plugins.values()).map((p) => p.metadata);
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private validatePlugin(plugin: ScanLibPlugin): void {
    const { metadata } = plugin;

    if (!metadata?.id) {
      throw new Error('Plugin must have a metadata.id');
    }

    if (!metadata.name) {
      throw new Error(`Plugin "${metadata.id}" must have a metadata.name`);
    }

    if (!metadata.version) {
      throw new Error(`Plugin "${metadata.id}" must have a metadata.version`);
    }

    if (!plugin.type) {
      throw new Error(`Plugin "${metadata.id}" must have a type`);
    }

    // Type-specific validation
    switch (plugin.type) {
      case 'ocr-adapter':
        if (typeof (plugin as OCRAdapterPlugin).extract !== 'function') {
          throw new Error(
            `OCR adapter plugin "${metadata.id}" must implement extract()`
          );
        }
        break;

      case 'image-processor':
        if (typeof (plugin as ImageProcessorPlugin).process !== 'function') {
          throw new Error(
            `Image processor plugin "${metadata.id}" must implement process()`
          );
        }
        break;

      case 'quality-validator':
        if (typeof (plugin as QualityValidatorPlugin).validate !== 'function') {
          throw new Error(
            `Quality validator plugin "${metadata.id}" must implement validate()`
          );
        }
        break;

      case 'post-processor':
        if (typeof (plugin as PostProcessorPlugin).process !== 'function') {
          throw new Error(
            `Post-processor plugin "${metadata.id}" must implement process()`
          );
        }
        break;

      case 'field-transformer':
        if (typeof (plugin as FieldTransformerPlugin).transform !== 'function') {
          throw new Error(
            `Field transformer plugin "${metadata.id}" must implement transform()`
          );
        }
        if (!(plugin as FieldTransformerPlugin).targetFields?.length) {
          throw new Error(
            `Field transformer plugin "${metadata.id}" must specify targetFields`
          );
        }
        break;
    }
  }

  private async initializePlugin(plugin: ScanLibPlugin): Promise<void> {
    const { id } = plugin.metadata;

    if (this.initialized.has(id)) {
      return;
    }

    if (plugin.initialize) {
      try {
        await plugin.initialize(this.context);
        this.initialized.add(id);
        this.context.logger.info(`Plugin "${id}" initialized`);
      } catch (error) {
        this.context.logger.error(`Failed to initialize plugin "${id}"`, error);
        throw error;
      }
    } else {
      this.initialized.add(id);
    }
  }

  private createContext(): PluginContext {
    return {
      config: this.config,
      logger: this.createLogger(),
      getPlugin: <T extends Plugin>(id: string) => this.get(id) as T | undefined,
    };
  }

  private createLogger(): PluginLogger {
    // Safe environment check for non-Node environments
    let isDev = true;
    try {
      const env = (globalThis as Record<string, unknown>).process as
        | { env?: { NODE_ENV?: string } }
        | undefined;
      isDev = env?.env?.NODE_ENV !== 'production';
    } catch {
      // process is not available, assume dev
    }

    return {
      debug: (message, data) => {
        if (isDev) {
          console.debug(`[scan-lib] ${message}`, data ?? '');
        }
      },
      info: (message, data) => {
        if (isDev) {
          console.info(`[scan-lib] ${message}`, data ?? '');
        }
      },
      warn: (message, data) => {
        console.warn(`[scan-lib] ${message}`, data ?? '');
      },
      error: (message, error) => {
        console.error(`[scan-lib] ${message}`, error ?? '');
      },
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultRegistry: PluginRegistry | null = null;

/**
 * Get or create the default plugin registry
 */
export function getPluginRegistry(config?: Record<string, unknown>): PluginRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new PluginRegistry(config);
  }
  return defaultRegistry;
}

/**
 * Reset the default registry (for testing)
 */
export function resetPluginRegistry(): void {
  if (defaultRegistry) {
    defaultRegistry.disposeAll();
    defaultRegistry = null;
  }
}
