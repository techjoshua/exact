import * as server from '../index.js';
import { createInspectionCatalogFixture } from '../../../component-composition-corpus/test-support/inspection-catalog-fixture.js';
import { expect, it } from 'vitest';
import { createExactServerDebugRuntime } from '../index.js';
import { verifyServerCatalogOwnership } from '../../../component-composition-corpus/test-support/server-catalog-journey.mjs';

it('captures catalog authority and retirement independently of writable caller aliases', async () => {
	expect(await verifyServerCatalogOwnership({ createExactServerDebugRuntime })).toBe(true);
});

it('captures deep source trees without native recursion and rejects a subsequent cycle', async () => {
	const catalog = createInspectionCatalogFixture();
	const root = catalog.roots.page.files[0]!.components[0]!;
	let entity = root;
	for (let index = 0; index < 20_000; index++) {
		const child = { ...root, id: `child:${index}`, children: [] };
		entity.children = [child];
		entity = child;
	}
	const runtime = createExactServerDebugRuntime({
		contract: { version: 1, invocations: {}, executors: {}, boundaries: {} }
	});
	try {
		const registration = runtime.registerCatalog(catalog);
		registration.dispose();
		entity.children = [root];
		expect(() => runtime.registerCatalog(catalog)).toThrow(TypeError);
	} finally {
		await runtime.close();
	}
});

it('keeps catalog storage behind the public server debug runtime', () => {
	for (const name of [
		'createExactInspectionCatalogRegistry',
		'ExactInspectionCatalogRegistry',
		'ExactInspectionCatalogRegistration'
	])
		expect(Object.hasOwn(server, name)).toBe(false);
});
