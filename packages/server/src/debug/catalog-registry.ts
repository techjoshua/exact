import {
	isExactBuildInspectionCatalog,
	type ExactBuildInspectionCatalog,
	type ExactInspectionRootCatalog
} from '@exactjs/devtools-protocol';

/** Disposable registration for one privately captured build catalog. */
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

/** Captures private catalog authority for server query composition and exact build retirement. */
export function createExactInspectionCatalogRegistry(
	initial: readonly ExactBuildInspectionCatalog[] = []
): ExactInspectionCatalogRegistry {
	const catalogs = new Map<string, ExactBuildInspectionCatalog>();
	const registry: ExactInspectionCatalogRegistry = {
		register(input) {
			const catalog = captureCatalogData(input);
			if (!isExactBuildInspectionCatalog(catalog))
				throw new TypeError('Invalid eXact build inspection catalog');
			if (catalogs.has(catalog.buildKey))
				throw new Error(`Duplicate eXact inspection build catalog ${catalog.buildKey}`);
			catalogs.set(catalog.buildKey, catalog);
			let active = true;
			return {
				dispose() {
					if (!active) return;
					active = false;
					if (catalogs.get(catalog.buildKey) === catalog) catalogs.delete(catalog.buildKey);
				}
			};
		},
		find(buildKey, executionRoot) {
			return catalogs.get(buildKey)?.roots[executionRoot];
		},
		builds() {
			return [...catalogs.values()];
		},
		dispose() {
			catalogs.clear();
		}
	};
	for (const catalog of initial) registry.register(catalog);
	return registry;
}

/**
 * Captures owned data before validation so later caller mutations cannot change authority.
 * An explicit work list handles deeply nested source trees without native recursion. Shared
 * references retain their identity inside the copy. Accessors and executable values are rejected
 * without invoking them. All captured fields remain ordinary writable data.
 */
function captureCatalogData<T>(input: T): T {
	const copies = new WeakMap<object, object>();
	const pending: { source: object; target: object }[] = [];
	const copy = (value: unknown): unknown => {
		if (value === null || typeof value !== 'object') {
			if (['function', 'symbol', 'bigint'].includes(typeof value))
				throw new TypeError('Inspection catalogs require data-only fields');
			return value;
		}
		const existing = copies.get(value);
		if (existing) return existing;
		const array = Array.isArray(value);
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== (array ? Array.prototype : Object.prototype) && prototype !== null)
			throw new TypeError('Inspection catalogs require plain data');
		const target = array ? [] : (Object.create(prototype) as object);
		copies.set(value, target);
		pending.push({ source: value, target });
		return target;
	};
	const captured = copy(input);
	while (pending.length) {
		const { source, target } = pending.pop()!;
		for (const key of Reflect.ownKeys(source)) {
			if (typeof key === 'symbol') throw new TypeError('Inspection catalogs require string keys');
			const descriptor = Object.getOwnPropertyDescriptor(source, key);
			if (!descriptor || !('value' in descriptor))
				throw new TypeError('Inspection catalogs require own data fields');
			Object.defineProperty(target, key, {
				value: copy(descriptor.value),
				enumerable: descriptor.enumerable,
				writable: true,
				configurable: !(Array.isArray(target) && key === 'length')
			});
		}
	}
	return captured as T;
}
