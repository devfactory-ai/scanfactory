/**
 * Runtime Configuration Manager for scan-lib
 *
 * Provides:
 * - Centralized configuration management
 * - Environment-based overrides
 * - Feature flags
 * - Runtime configuration updates
 * - Validation and type safety
 */

import type { ScanLibConfig, OCRConfig, CaptureConfig, EdgeDetectionConfig, StorageConfig } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface RuntimeConfig extends ScanLibConfig {
  /** Feature flags */
  features: FeatureFlags;

  /** Debug settings */
  debug: DebugConfig;

  /** Environment name */
  environment: 'development' | 'staging' | 'production';
}

export interface FeatureFlags {
  /** Enable experimental features */
  experimentalFeatures: boolean;

  /** Enable offline mode */
  offlineMode: boolean;

  /** Enable batch scanning */
  batchScanning: boolean;

  /** Enable multi-page documents */
  multiPage: boolean;

  /** Enable auto-rotation correction */
  autoRotation: boolean;

  /** Enable document classification */
  documentClassification: boolean;

  /** Enable quality warnings */
  qualityWarnings: boolean;

  /** Custom feature flags */
  [key: string]: boolean;
}

export interface DebugConfig {
  /** Show debug overlay on camera */
  showDebugOverlay: boolean;

  /** Log OCR requests/responses */
  logOCR: boolean;

  /** Log quality metrics */
  logQuality: boolean;

  /** Log edge detection */
  logEdgeDetection: boolean;

  /** Performance timing */
  performanceTimings: boolean;
}

export type ConfigUpdateCallback = (config: RuntimeConfig) => void;

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_FEATURES: FeatureFlags = {
  experimentalFeatures: false,
  offlineMode: true,
  batchScanning: true,
  multiPage: true,
  autoRotation: true,
  documentClassification: false,
  qualityWarnings: true,
};

const DEFAULT_DEBUG: DebugConfig = {
  showDebugOverlay: false,
  logOCR: false,
  logQuality: false,
  logEdgeDetection: false,
  performanceTimings: false,
};

const DEFAULT_OCR: OCRConfig = {
  mode: 'remote',
  timeout: 30000,
  retries: 3,
};

const DEFAULT_CAPTURE: CaptureConfig = {
  quality: 'high',
  autoCapture: true,
  autoCaptureDelay: 1000,
  maxWidth: 2400,
  aspectRatio: 1.414,
  defaultFacing: 'back',
};

const DEFAULT_EDGE_DETECTION: EdgeDetectionConfig = {
  enabled: true,
  minAreaRatio: 0.2,
  stabilityThreshold: 5,
  sensitivity: 0.7,
};

const DEFAULT_STORAGE: StorageConfig = {
  persistPending: true,
  maxPendingItems: 50,
  keyPrefix: 'scanlib_',
};

// ============================================================================
// Config Manager
// ============================================================================

export class ConfigManager {
  private config: RuntimeConfig;
  private subscribers = new Set<ConfigUpdateCallback>();
  private isInitialized = false;

  constructor() {
    this.config = this.createDefaultConfig();
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  /**
   * Initialize configuration with overrides
   */
  initialize(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
    const envConfig = this.loadEnvironmentConfig();

    this.config = this.mergeConfigs(
      this.createDefaultConfig(),
      envConfig,
      overrides
    );

    this.validateConfig(this.config);
    this.isInitialized = true;

    return this.config;
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.config = this.createDefaultConfig();
    this.notifySubscribers();
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  /**
   * Get full configuration
   */
  getConfig(): RuntimeConfig {
    return { ...this.config };
  }

  /**
   * Get OCR configuration
   */
  getOCRConfig(): OCRConfig {
    return { ...this.config.ocr };
  }

  /**
   * Get capture configuration
   */
  getCaptureConfig(): CaptureConfig {
    return { ...this.config.capture };
  }

  /**
   * Get edge detection configuration
   */
  getEdgeDetectionConfig(): EdgeDetectionConfig {
    return { ...this.config.edgeDetection };
  }

  /**
   * Get storage configuration
   */
  getStorageConfig(): StorageConfig {
    return { ...this.config.storage };
  }

  /**
   * Get feature flags
   */
  getFeatures(): FeatureFlags {
    return { ...this.config.features };
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(feature: keyof FeatureFlags): boolean {
    return this.config.features[feature] ?? false;
  }

  /**
   * Get debug configuration
   */
  getDebugConfig(): DebugConfig {
    return { ...this.config.debug };
  }

  /**
   * Check if in development mode
   */
  isDevelopment(): boolean {
    return this.config.environment === 'development';
  }

  /**
   * Check if in production mode
   */
  isProduction(): boolean {
    return this.config.environment === 'production';
  }

  // --------------------------------------------------------------------------
  // Setters
  // --------------------------------------------------------------------------

  /**
   * Update configuration
   */
  update(updates: Partial<RuntimeConfig>): void {
    this.config = this.mergeConfigs(this.config, updates);
    this.validateConfig(this.config);
    this.notifySubscribers();
  }

  /**
   * Update OCR configuration
   */
  updateOCR(updates: Partial<OCRConfig>): void {
    this.config.ocr = { ...this.config.ocr, ...updates };
    this.notifySubscribers();
  }

  /**
   * Update capture configuration
   */
  updateCapture(updates: Partial<CaptureConfig>): void {
    this.config.capture = { ...this.config.capture, ...updates };
    this.notifySubscribers();
  }

  /**
   * Update edge detection configuration
   */
  updateEdgeDetection(updates: Partial<EdgeDetectionConfig>): void {
    this.config.edgeDetection = { ...this.config.edgeDetection, ...updates };
    this.notifySubscribers();
  }

  /**
   * Enable a feature flag
   */
  enableFeature(feature: keyof FeatureFlags): void {
    this.config.features[feature] = true;
    this.notifySubscribers();
  }

  /**
   * Disable a feature flag
   */
  disableFeature(feature: keyof FeatureFlags): void {
    this.config.features[feature] = false;
    this.notifySubscribers();
  }

  /**
   * Toggle a feature flag
   */
  toggleFeature(feature: keyof FeatureFlags): boolean {
    this.config.features[feature] = !this.config.features[feature];
    this.notifySubscribers();
    return this.config.features[feature];
  }

  /**
   * Set auth token provider
   */
  setAuthTokenProvider(provider: () => Promise<string>): void {
    this.config.getAuthToken = provider;
  }

  // --------------------------------------------------------------------------
  // Subscriptions
  // --------------------------------------------------------------------------

  /**
   * Subscribe to configuration changes
   */
  subscribe(callback: ConfigUpdateCallback): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers(): void {
    const config = this.getConfig();
    this.subscribers.forEach((callback) => {
      try {
        callback(config);
      } catch (error) {
        console.error('Config subscriber error:', error);
      }
    });
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private createDefaultConfig(): RuntimeConfig {
    return {
      ocr: { ...DEFAULT_OCR },
      capture: { ...DEFAULT_CAPTURE },
      edgeDetection: { ...DEFAULT_EDGE_DETECTION },
      storage: { ...DEFAULT_STORAGE },
      features: { ...DEFAULT_FEATURES },
      debug: { ...DEFAULT_DEBUG },
      environment: this.detectEnvironment(),
    };
  }

  private loadEnvironmentConfig(): Partial<RuntimeConfig> {
    const config: Partial<RuntimeConfig> = {};

    // These would typically come from environment variables in React Native
    // or from a remote config service

    // Example: process.env.SCANLIB_OCR_MODE
    // In React Native: Config.SCANLIB_OCR_MODE

    // For now, return empty - apps can override via initialize()
    return config;
  }

  private detectEnvironment(): 'development' | 'staging' | 'production' {
    // Check common environment indicators
    // Using try-catch to safely access process.env in any environment
    try {
      const env = (globalThis as Record<string, unknown>).process as
        | { env?: { NODE_ENV?: string } }
        | undefined;
      if (env?.env?.NODE_ENV === 'production') return 'production';
      if (env?.env?.NODE_ENV === 'staging') return 'staging';
    } catch {
      // process is not available
    }

    // Default to development for safety
    return 'development';
  }

  private mergeConfigs(
    base: RuntimeConfig,
    ...overrides: Array<Partial<RuntimeConfig>>
  ): RuntimeConfig {
    let result = { ...base };

    for (const override of overrides) {
      if (!override) continue;

      result = {
        ...result,
        ...override,
        ocr: { ...result.ocr, ...override.ocr },
        capture: { ...result.capture, ...override.capture },
        edgeDetection: { ...result.edgeDetection, ...override.edgeDetection },
        storage: { ...result.storage, ...override.storage },
        features: { ...result.features, ...override.features },
        debug: { ...result.debug, ...override.debug },
      };
    }

    return result;
  }

  private validateConfig(config: RuntimeConfig): void {
    // OCR validation
    if (config.ocr.timeout < 1000) {
      console.warn('OCR timeout is very low (<1s), may cause issues');
    }
    if (config.ocr.timeout > 120000) {
      throw new Error('OCR timeout cannot exceed 2 minutes');
    }
    if (config.ocr.retries < 0 || config.ocr.retries > 10) {
      throw new Error('OCR retries must be between 0 and 10');
    }

    // Capture validation
    if (config.capture.maxWidth < 600) {
      throw new Error('maxWidth must be at least 600px');
    }
    if (config.capture.maxWidth > 4096) {
      console.warn('maxWidth > 4096 may cause memory issues on mobile');
    }
    if (config.capture.autoCaptureDelay < 300) {
      console.warn('autoCaptureDelay < 300ms may be too fast');
    }

    // Edge detection validation
    if (config.edgeDetection.minAreaRatio < 0.1 || config.edgeDetection.minAreaRatio > 0.9) {
      throw new Error('minAreaRatio must be between 0.1 and 0.9');
    }
    if (config.edgeDetection.stabilityThreshold < 1) {
      throw new Error('stabilityThreshold must be at least 1');
    }

    // Storage validation
    if (config.storage.maxPendingItems < 1) {
      throw new Error('maxPendingItems must be at least 1');
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultManager: ConfigManager | null = null;

/**
 * Get the default config manager instance
 */
export function getConfigManager(): ConfigManager {
  if (!defaultManager) {
    defaultManager = new ConfigManager();
  }
  return defaultManager;
}

/**
 * Reset the default config manager (for testing)
 */
export function resetConfigManager(): void {
  defaultManager = null;
}

/**
 * Initialize the default config manager
 */
export function initializeConfig(
  overrides?: Partial<RuntimeConfig>
): RuntimeConfig {
  return getConfigManager().initialize(overrides);
}
