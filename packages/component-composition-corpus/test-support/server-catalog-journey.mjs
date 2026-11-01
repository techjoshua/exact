import { createInspectionCatalogFixture } from './inspection-catalog-fixture.js';

/** Checks captured catalog authority, retirement and ordinary registration handles. */
export async function verifyServerCatalogOwnership({ createExactServerDebugRuntime }) {
	const catalog = createInspectionCatalogFixture('component:Page');
	const { buildKey } = catalog;
	const { path, sourceHash } = catalog.roots.page.files[0];
	catalog.roots.page.redactions.secretNames.push('API_SECRET');
	const source = { buildKey, executionRoot: 'page', sourceHash, content: 'do-not-expose' };
	const runtime = createExactServerDebugRuntime({
		contract: { version: 1, invocations: {}, executors: {}, boundaries: {} },
		allowDebug: true,
		inspectionCatalogs: [catalog],
		inspectionSources: { [`${buildKey}\0page\0${path}`]: source }
	});
	const request = {
		method: 'POST',
		url: 'https://app.test/__exact',
		headers: { origin: 'https://app.test' }
	};
	try {
		const opened = await runtime.handle(request, {
			type: 'debug',
			version: 1,
			request: 'open',
			capabilities: ['catalog', 'source']
		});
		const sessionId = JSON.parse(opened.body).session.id;
		const query = (method, params) =>
			runtime.handle(request, {
				type: 'debug',
				version: 1,
				request: 'query',
				sessionId,
				query: { protocol: 1, id: 'catalog', method, params }
			});
		const identity = {
			sessionId,
			side: 'server',
			buildKey,
			executionRoot: 'page',
			componentTypeId: 'component:Page'
		};
		const params = { identity, path, sourceHash };
		if ((await query('source.excerpt', params)).status !== 404)
			throw new Error('Initial source redaction');
		catalog.roots.page.redactions.secretNames.length = 0;
		catalog.roots.page.rootComponentId = 'changed';
		catalog.buildKey = 'c'.repeat(40);
		const rejected = await query('source.excerpt', params);
		if (rejected.status !== 404 || rejected.body.includes(source.content))
			throw new Error('Catalog alias changed redaction authority');
		const roots = JSON.parse((await query('roots.list', {})).body).result;
		if (
			roots.length !== 1 ||
			roots[0].buildKey !== buildKey ||
			roots[0].rootComponentId !== 'component:Page'
		)
			throw new Error('Catalog alias changed identity');
		source.redacted = true;
		if ((await query('source.excerpt', params)).status !== 200)
			throw new Error('Pre-redacted source control');
		catalog.roots.page.rootComponentId = 'component:Page';
		const registration = runtime.registerCatalog(catalog);
		const dispose = registration.dispose;
		registration.dispose = () => {};
		registration.dispose = dispose;
		catalog.buildKey = 'd'.repeat(40);
		registration.dispose();
		registration.dispose();
		const remaining = JSON.parse((await query('roots.list', {})).body).result;
		if (remaining.length !== 1 || remaining[0].buildKey !== buildKey)
			throw new Error('Catalog retirement depends on caller identity');
		let reads = 0;
		Object.defineProperty(catalog, 'producer', {
			enumerable: true,
			get() {
				reads++;
				throw new Error('Authored getter');
			}
		});
		let rejectedGetter = false;
		try {
			runtime.registerCatalog(catalog);
		} catch {
			rejectedGetter = true;
		}
		if (!rejectedGetter || reads !== 0) throw new Error('Catalog capture invoked an accessor');
		return true;
	} finally {
		await runtime.close();
	}
}
