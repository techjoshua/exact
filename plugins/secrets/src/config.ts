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
  scope(consumer: SecretConsumerIdentity): ScopedSecretResolver;
  dispose(): void | Promise<void>;
}

export interface SecretConsumerIdentity {
  package: string;
  version?: string;
  integrity?: string;
  applicationOwner?: boolean;
}

export interface SecretAccessGrant {
  package: string;
  secrets: readonly string[];
  version?: string;
  integrity?: string;
}

export interface SecretAuditEvent {
  operation: "require" | "optional";
  selector: string;
  selectorRedacted: boolean;
  consumer: Omit<SecretConsumerIdentity, "applicationOwner">;
  authorization: "implicit-application-owner" | "explicit-grant" | "denied";
  requestId?: string;
}

export interface ScopedSecretResolver {
  require(name: string): Secret<string>;
  optional(name: string): Secret<string> | undefined;
}

export interface SecretsPluginConfig {
  providers: SecretProvider[];
  required: string[];
  grants: SecretAccessGrant[];
  audit?: {
    redactIdentifiers?: boolean;
    requestId?: () => string | undefined;
    onEvent(event: SecretAuditEvent): void;
  };
}

declare module "@exact/config" {
  interface ExactPluginConfigRegistry {
    secrets: SecretsPluginConfig;
  }
}

export {};
