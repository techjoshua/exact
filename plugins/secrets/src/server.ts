import type { ExactRuntimePluginExtension } from '@exactjs/plugin-api';
import type { SecretProviderContext, SecretResolver, SecretsPluginConfig } from './config.js';

/**
 * Resolves named secrets from an ordered provider list after successful initialize().
 * Overlapping initialization shares a promise and captures its source signal when queued.
 * Values publish together, failed attempts can retry, and disposal clears values and fences late work.
 */
export function createSecretResolver(
	config: SecretsPluginConfig,
	context: SecretProviderContext
): SecretResolver {
	let values = new Map<string, import('./index.js').Secret<string>>();
	let initialized = false;
	let generation = 0;
	let pending: { controller: AbortController; promise: Promise<void> } | undefined;
	return {
		initialize() {
			if (initialized) return Promise.resolve();
			if (pending) return pending.promise;
			const controller = new AbortController();
			const current = generation;
			// Capture the owner at enqueue time while preserving asynchronous getter failures.
			const promise = new Promise<AbortSignal>((resolve) => resolve(context.signal)).then(
				(signal) => loadProviders(current, controller, signal)
			);
			pending = { controller, promise };
			const release = () => {
				if (pending?.promise === promise) pending = undefined;
			};
			void promise.then(release, release);
			return promise;
		},
		require(name) {
			const value = resolve(name);
			if (value === undefined) throw new Error(`Secret ${name} is not configured`);
			return value;
		},
		optional(name) {
			return resolve(name);
		},
		dispose() {
			generation++;
			pending?.controller.abort(new DOMException('Secret resolver disposed', 'AbortError'));
			pending = undefined;
			values.clear();
			initialized = false;
		}
	};

	/** Publishes one complete provider snapshot only while its initialization generation remains live. */
	async function loadProviders(
		current: number,
		controller: AbortController,
		signal: AbortSignal
	): Promise<void> {
		const abort = () => controller.abort(signal.reason);
		if (signal.aborted) abort();
		else signal.addEventListener('abort', abort, { once: true });
		const check = () => {
			controller.signal.throwIfAborted();
			if (generation !== current) throw new Error('Secret resolver initialization was superseded');
		};
		try {
			const loadedValues = new Map<string, import('./index.js').Secret<string>>();
			check();
			const applicationRoot = context.applicationRoot;
			const environment = context.environment;
			for (const provider of config.providers) {
				const loaded = await provider.load({
					applicationRoot,
					environment,
					signal: controller.signal
				});
				check();
				for (const [name, value] of Object.entries(loaded)) loadedValues.set(name, value);
			}
			for (const name of config.required) {
				if (!loadedValues.has(name)) throw new Error(`Required secret ${name} is not configured`);
			}
			check();
			values = loadedValues;
			initialized = true;
		} finally {
			signal.removeEventListener('abort', abort);
		}
	}

	function resolve(name: string): import('./index.js').Secret<string> | undefined {
		if (!initialized) throw new Error('Secret resolver has not been initialized');
		return values.get(name);
	}
}

/** Connects resolver initialization and application disposal to the secrets plugin host lifecycle. */
export default function createSecretsServerExtension(
	resolver: SecretResolver
): ExactRuntimePluginExtension {
	return {
		async validate() {
			await resolver.initialize();
			return undefined;
		},
		async initializeApplication() {
			await resolver.initialize();
			return { dispose: () => resolver.dispose() };
		}
	};
}
