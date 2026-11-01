import type { IntlCatalogV1, IntlRuntimeDescriptorV1 } from './contracts.js';
import { validateIntlCatalog, validateIntlRuntimeDescriptor } from './validation.js';
import { captureArray } from './protocol-data.js';
type IntlArtifactEntry = Readonly<{
	generation: number;
	fingerprint: string;
	descriptors: readonly IntlRuntimeDescriptorV1[];
	catalogs: readonly IntlCatalogV1[];
}>;
/** Allocates shared compiled registrations only when artifact consumers use them. */
function artifactRegistry(): Map<string, IntlArtifactEntry> {
	const artifactRegistryKey = Symbol.for('@exactjs/intl.artifact-registry');
	const scope = globalThis as typeof globalThis & {
		[artifactRegistryKey]?: Map<string, IntlArtifactEntry>;
	};
	return (scope[artifactRegistryKey] ??= new Map());
}

/** Retains the shared revision without allocating it during an unused module import. */
function artifactRevision(): { value: number } {
	const artifactRevisionKey = Symbol.for('@exactjs/intl.artifact-revision');
	const scope = globalThis as typeof globalThis & {
		[artifactRevisionKey]?: { value: number };
	};
	return (scope[artifactRevisionKey] ??= { value: 0 });
}

/** Checks for new registrations without copying the registered descriptor and catalog lists. */
export function currentIntlArtifactRevision(): number {
	return artifactRevision().value;
}

/** Registers one validated build companion while fencing stale generations. */
export function registerIntlArtifacts(
	moduleId: string,
	generation: number,
	descriptorInputs: readonly unknown[],
	catalogInputs: readonly unknown[]
): void {
	if (!moduleId || !Number.isSafeInteger(generation) || generation < 0)
		throw new TypeError('Intl artifact identity and generation are invalid');
	const descriptors = captureArray(descriptorInputs, 'artifact.descriptors').map((descriptor) =>
		validateIntlRuntimeDescriptor(descriptor)
	);
	const catalogs = captureArray(catalogInputs, 'artifact.catalogs').map((catalog) =>
		validateIntlCatalog(catalog, descriptors)
	);
	const fingerprint = JSON.stringify({ descriptors, catalogs });
	const registry = artifactRegistry();
	const previous = registry.get(moduleId);
	if (previous && previous.generation > generation) return;
	if (previous?.generation === generation && previous.fingerprint !== fingerprint)
		throw new Error(`Intl artifact ${moduleId} disagrees within generation ${generation}`);
	if (previous?.generation === generation && previous.fingerprint === fingerprint) return;
	registry.set(moduleId, { generation, fingerprint, descriptors, catalogs });
	artifactRevision().value++;
}
/** Returns ordinary artifact observations in detached lists for environment initialization. */
export function snapshotIntlArtifacts(): Readonly<{
	revision: number;
	descriptors: readonly IntlRuntimeDescriptorV1[];
	catalogs: readonly IntlCatalogV1[];
}> {
	const entries = [...artifactRegistry().values()];
	return {
		revision: artifactRevision().value,
		descriptors: entries.flatMap((entry) => entry.descriptors),
		catalogs: entries.flatMap((entry) => entry.catalogs)
	};
}
