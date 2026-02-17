/**
 * React hooks for accessing scan-lib configuration
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getConfigManager,
  type RuntimeConfig,
  type FeatureFlags,
} from './ConfigManager';

/**
 * Hook to access and update scan-lib configuration
 */
export function useConfig() {
  const manager = getConfigManager();
  const [config, setConfig] = useState<RuntimeConfig>(manager.getConfig());

  useEffect(() => {
    // Subscribe to config changes
    const unsubscribe = manager.subscribe((newConfig) => {
      setConfig(newConfig);
    });

    return unsubscribe;
  }, [manager]);

  const updateConfig = useCallback(
    (updates: Partial<RuntimeConfig>) => {
      manager.update(updates);
    },
    [manager]
  );

  const enableFeature = useCallback(
    (feature: keyof FeatureFlags) => {
      manager.enableFeature(feature);
    },
    [manager]
  );

  const disableFeature = useCallback(
    (feature: keyof FeatureFlags) => {
      manager.disableFeature(feature);
    },
    [manager]
  );

  const toggleFeature = useCallback(
    (feature: keyof FeatureFlags) => {
      return manager.toggleFeature(feature);
    },
    [manager]
  );

  return useMemo(
    () => ({
      config,
      updateConfig,
      enableFeature,
      disableFeature,
      toggleFeature,
      isFeatureEnabled: (feature: keyof FeatureFlags) =>
        config.features[feature] ?? false,
      isDevelopment: config.environment === 'development',
      isProduction: config.environment === 'production',
    }),
    [config, updateConfig, enableFeature, disableFeature, toggleFeature]
  );
}

/**
 * Hook to check a specific feature flag
 */
export function useFeatureFlag(feature: keyof FeatureFlags): boolean {
  const manager = getConfigManager();
  const [enabled, setEnabled] = useState(manager.isFeatureEnabled(feature));

  useEffect(() => {
    const unsubscribe = manager.subscribe((newConfig) => {
      setEnabled(newConfig.features[feature] ?? false);
    });

    return unsubscribe;
  }, [manager, feature]);

  return enabled;
}
