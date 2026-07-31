import {
	isExactBuildInspectionCatalog,
	type ExactBuildInspectionCatalog,
	type ExactInspectionRootCatalog
} from '@exactjs/devtools-protocol';

/** Disposable registration for one immutable build catalog. */
export interface ExactInspectionCatalogRegistration {
	dispose(): void;
}

/** Build/root keyed catalog registry with deterministic retirement. */
export interface ExactInspectionCatalogRegistry {
	register(catalog: ExactBuildInspectionCatalog): ExactInspectionCatalogRegistration;
	find(buildKey: string, executionRoot: string): ExactInspectionRootCatalog | undefined;
	builds(): readonly ExactBuildInspectionCatalog[];
	dispose(): void;
}

/** Creates a duplicate-checked registry that never falls forward to a newer build. */
export function createExactInspectionCatalogRegistry(
	initial: readonly ExactBuildInspectionCatalog[] = []
): ExactInspectionCatalogRegistry {
	const catalogs = new Map<string, ExactBuildInspectionCatalog>();
	const registry: ExactInspectionCatalogRegistry = {
		register(catalog) {
			if (!isExactBuildInspectionCatalog(catalog))
				throw new TypeError('Invalid eXact build inspection catalog');
			if (catalogs.has(catalog.buildKey))
				throw new Error(`Duplicate eXact inspection build catalog ${catalog.buildKey}`);
			catalogs.set(catalog.buildKey, catalog);
			let active = true;
			return Object.freeze({
				dispose() {
					if (!active) return;
					active = false;
					if (catalogs.get(catalog.buildKey) === catalog) catalogs.delete(catalog.buildKey);
				}
			});
		},
		find(buildKey, executionRoot) {
			return catalogs.get(buildKey)?.roots[executionRoot];
		},
		builds() {
			return Object.freeze([...catalogs.values()]);
		},
		dispose() {
			catalogs.clear();
		}
	};
	for (const catalog of initial) registry.register(catalog);
	return Object.freeze(registry);
}
