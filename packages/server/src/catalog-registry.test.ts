// @ts-expect-error Catalog storage is internal to the server debug runtime.
import type { createExactInspectionCatalogRegistry as _RegistryFactory } from './index.js';
// @ts-expect-error Registry implementation types are not application APIs.
import type { ExactInspectionCatalogRegistry as _Registry } from './index.js';
// @ts-expect-error Registration handles are obtained through the server debug runtime.
import type { ExactInspectionCatalogRegistration as _Registration } from './index.js';

import { createInspectionCatalogFixture } from '../../component-composition-corpus/test-support/inspection-catalog-fixture.js';
import { describe, expect, it } from 'vitest';
import { createExactInspectionCatalogRegistry } from './debug/catalog-registry.js';

describe('retained inspection catalog ownership', () => {
	it('retires only the exact registered build when its lifecycle handle is disposed', () => {
		const first = catalog('1'.repeat(40));
		const second = catalog('2'.repeat(40));
		const registry = createExactInspectionCatalogRegistry([first]);
		const retained = registry.register(second);

		expect(registry.find(first.buildKey, 'page')).toEqual(first.roots.page);
		expect(registry.find(second.buildKey, 'page')).toEqual(second.roots.page);
		retained.dispose();
		expect(registry.find(second.buildKey, 'page')).toBeUndefined();
		expect(registry.find(first.buildKey, 'page')).toEqual(first.roots.page);
	});
});

function catalog(buildKey: string) {
	return { ...createInspectionCatalogFixture('component:Page'), buildKey };
}
