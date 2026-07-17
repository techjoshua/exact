import type { Secret } from "./index.js";
import type {} from "@exact/config";

export interface SecretProviderContext {
  readonly applicationRoot: string;
  readonly environment: string;
  readonly signal: AbortSignal;
}

export interface SecretProvider {
  readonly name: string;
  load(context: SecretProviderContext): Promise<Readonly<Record<string, Secret<string>>>>;
}

export interface SecretResolver {
  initialize(): Promise<void>;
  get(name: string): Secret<string>;
  has(name: string): boolean;
  dispose(): void | Promise<void>;
}

export interface SecretsPluginConfig {
  providers: SecretProvider[];
  required: string[];
}

declare module "@exact/config" {
  interface ExactPluginConfigRegistry {
    secrets: SecretsPluginConfig;
  }
}

export {};
