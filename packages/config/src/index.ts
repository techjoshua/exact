import type {
  ExactPluginConfigContext,
  ExactPluginConfigTransform
} from "@exact/plugin-api";

export interface ExactPluginConfigRegistry {}

export type ExactPluginDiscoveryConfig =
  | {
      mode?: "root";
      ignore?: readonly string[];
    }
  | {
      mode: "trusted";
      trustedPackages?: readonly string[];
      trustedPrefixes?: readonly string[];
      includeDefaultTrustedPrefixes?: boolean;
      ignore?: readonly string[];
    }
  | {
      mode: "all";
      ignore?: readonly string[];
    };

export interface ExactConfig {
  pluginDiscovery?: ExactPluginDiscoveryConfig;
  plugins?: {
    [K in keyof ExactPluginConfigRegistry]?:
      | ExactPluginConfigTransform<ExactPluginConfigRegistry[K]>
      | false;
  };
}

export function defineConfig<const T extends ExactConfig>(config: T): T {
  return config;
}

export type { ExactPluginConfigContext, ExactPluginConfigTransform };
