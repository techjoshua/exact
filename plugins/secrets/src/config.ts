import type {} from '@exactjs/config';
import type { Secret } from './values.js';

/** Carries the context required by secret provider. */
export interface SecretProviderContext {
	readonly applicationRoot: string;
	readonly environment: string;
	readonly signal: AbortSignal;
}

/** Defines the secret provider interface contract. */
export interface SecretProvider {
	readonly name: string;
	load(context: SecretProviderContext): Promise<Readonly<Record<string, Secret<string>>>>;
}

/** Defines the secret resolver interface contract. */
export interface SecretResolver {
	initialize(): Promise<void>;
	require(name: string): Secret<string>;
	optional(name: string): Secret<string> | undefined;
	dispose(): void | Promise<void>;
}

/** Configures secrets plugin. */
export interface SecretsPluginConfig {
	providers: SecretProvider[];
	required: string[];
	/** Dependency packages whose own compiled code may call consume(). */
	allowPackages: string[];
}

declare module '@exactjs/config' {
	interface ExactPluginConfigRegistry {
		secrets: SecretsPluginConfig;
	}
}

export {};
