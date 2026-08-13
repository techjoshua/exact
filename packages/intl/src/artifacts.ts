import type { IntlCatalogV1, IntlRuntimeDescriptorV1 } from './contracts.js';
import { validateIntlCatalog, validateIntlRuntimeDescriptor } from './validation.js';

type IntlArtifactEntry = Readonly<{
	generation: number;
	fingerprint: string;
	descriptors: readonly IntlRuntimeDescriptorV1[];
	catalogs: readonly IntlCatalogV1[];
}>;

const artifactRegistryKey = Symbol.for('@exactjs/intl.artifact-registry');
const artifactRevisionKey = Symbol.for('@exactjs/intl.artifact-revision');
const artifactRegistry = (() => {
	const scope = globalThis as typeof globalThis & {
		[artifactRegistryKey]?: Map<string, IntlArtifactEntry>;
	};
	return (scope[artifactRegistryKey] ??= new Map());
})();
const artifactRevision = (() => {
	const scope = globalThis as typeof globalThis & {
		[artifactRevisionKey]?: { value: number };
	};
	return (scope[artifactRevisionKey] ??= { value: 0 });
})();

/** Registers one validated build companion while fencing stale generations. */
export function registerIntlArtifacts(
	moduleId: string,
	generation: number,
	descriptorInputs: readonly unknown[],
	catalogInputs: readonly unknown[]
): void {
	if (!moduleId || !Number.isSafeInteger(generation) || generation < 0)
		throw new TypeError('Intl artifact identity and generation are invalid');
	const descriptors = Object.freeze(
		descriptorInputs.map((descriptor) => validateIntlRuntimeDescriptor(descriptor))
	);
	const catalogs = Object.freeze(
		catalogInputs.map((catalog) => validateIntlCatalog(catalog, descriptors))
	);
	const fingerprint = JSON.stringify({ descriptors, catalogs });
	const previous = artifactRegistry.get(moduleId);
	if (previous && previous.generation > generation) return;
	if (previous?.generation === generation && previous.fingerprint !== fingerprint)
		throw new Error(`Intl artifact ${moduleId} disagrees within generation ${generation}`);
	if (previous?.generation === generation && previous.fingerprint === fingerprint) return;
	artifactRegistry.set(moduleId, Object.freeze({ generation, fingerprint, descriptors, catalogs }));
	artifactRevision.value++;
}

/** Returns the currently accepted build artifacts for environment initialization. */
export function snapshotIntlArtifacts(): Readonly<{
	revision: number;
	descriptors: readonly IntlRuntimeDescriptorV1[];
	catalogs: readonly IntlCatalogV1[];
}> {
	return Object.freeze({
		revision: artifactRevision.value,
		descriptors: Object.freeze(
			[...artifactRegistry.values()].flatMap((entry) => entry.descriptors)
		),
		catalogs: Object.freeze([...artifactRegistry.values()].flatMap((entry) => entry.catalogs))
	});
}
