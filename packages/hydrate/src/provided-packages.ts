/** A page-owned registry of package module instances shared with remote bundles. */
export interface ExactProvidedPackageRegistry {
	register(key: string, module: unknown): void;
	require(key: string): unknown;
}

const registrySymbol = Symbol.for('@exactjs/provided-packages');
const maximumDiagnosticKeyLength = 160;

type RegistryHost = typeof globalThis & {
	[registrySymbol]?: ExactProvidedPackageRegistry;
};

/** Returns the process-realm registry used by page and remote client bundles. */
export function getExactProvidedPackageRegistry(): ExactProvidedPackageRegistry {
	const host = globalThis as RegistryHost;
	const existing = host[registrySymbol];
	if (existing) return existing;

	const modules = new Map<string, unknown>();
	const registry: ExactProvidedPackageRegistry = Object.freeze({
		register(key: string, module: unknown): void {
			validateKey(key);
			if (modules.has(key)) {
				if (modules.get(key) !== module) {
					throw new Error(
						`Provided package ${diagnosticKey(key)} was registered with a different module instance`
					);
				}
				return;
			}
			modules.set(key, module);
		},
		require(key: string): unknown {
			validateKey(key);
			if (!modules.has(key)) {
				throw new Error(`Required provided package ${diagnosticKey(key)} is not registered`);
			}
			return modules.get(key);
		}
	});
	host[registrySymbol] = registry;
	return registry;
}

function validateKey(key: string): void {
	if (typeof key !== 'string' || key.length === 0)
		throw new Error('Provided package key must be a non-empty string');
}

function diagnosticKey(key: string): string {
	return JSON.stringify(
		key.length <= maximumDiagnosticKeyLength ? key : `${key.slice(0, maximumDiagnosticKeyLength)}…`
	);
}
