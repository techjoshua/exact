import type { ExactRuntimePluginExtension } from '@exact/plugin-api';
import type { SecretProviderContext, SecretResolver, SecretsPluginConfig } from './config.js';

/** Creates a secret resolver. */
export function createSecretResolver(
	config: SecretsPluginConfig,
	context: SecretProviderContext
): SecretResolver {
	const values = new Map<string, import('./index.js').Secret<string>>();
	let initialized = false;
	return {
		async initialize() {
			if (initialized) return;
			for (const provider of config.providers) {
				const loaded = await provider.load(context);
				for (const [name, value] of Object.entries(loaded)) values.set(name, value);
			}
			for (const name of config.required) {
				if (!values.has(name)) throw new Error(`Required secret ${name} is not configured`);
			}
			initialized = true;
		},
		require(name) {
			const value = resolve(name);
			if (!value) throw new Error(`Secret ${name} is not configured`);
			return value;
		},
		optional(name) {
			return resolve(name);
		},
		dispose() {
			values.clear();
			initialized = false;
		}
	};

	function resolve(name: string): import('./index.js').Secret<string> | undefined {
		if (!initialized) throw new Error('Secret resolver has not been initialized');
		return values.get(name);
	}
}

/** Creates a secrets server extension. */
export default function createSecretsServerExtension(
	resolver: SecretResolver
): ExactRuntimePluginExtension {
	return Object.freeze({
		async validate() {
			await resolver.initialize();
			return undefined;
		},
		async initializeApplication() {
			await resolver.initialize();
			return { dispose: () => resolver.dispose() };
		}
	});
}
