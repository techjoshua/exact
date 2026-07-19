import type {} from '@exact/config';
import type { Secret } from './index.js';

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
	require(name: string): Secret<string>;
	optional(name: string): Secret<string> | undefined;
	dispose(): void | Promise<void>;
}

export interface SecretsPluginConfig {
	providers: SecretProvider[];
	required: string[];
	/** Dependency packages whose own compiled code may call consume(). */
	allowPackages: string[];
}

declare module '@exact/config' {
	interface ExactPluginConfigRegistry {
		secrets: SecretsPluginConfig;
	}
}

export {};
