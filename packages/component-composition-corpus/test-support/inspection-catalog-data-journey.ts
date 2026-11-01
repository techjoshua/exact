import { createInspectionCatalogFixture } from './inspection-catalog-fixture.js';
type CatalogDataApi = Pick<
	typeof import('@exactjs/devtools-protocol'),
	'isExactBuildInspectionCatalog' | 'isExactInspectionRuntimeId'
>;

/** Checks catalog and runtime identity validation rejects authored properties without executing their bodies. */
export function verifyInspectionCatalogData(api: CatalogDataApi): void {
	const check = (value: boolean, message: string) => {
		if (!value) throw new Error('Inspection catalog data: ' + message);
	};
	const selectors: Array<
		(value: ReturnType<typeof createInspectionCatalogFixture>) => [object, string]
	> = [
		(value) => [value, 'producer'],
		(value) => [value.roots, 'page'],
		(value) => [value.roots.page, 'files'],
		(value) => [value.roots.page.files[0]!, 'path'],
		(value) => [value.roots.page.files[0]!.components[0]!, 'id'],
		(value) => [value.roots.page.files[0]!.components[0]!.location.start, 'offset'],
		(value) => [value.roots.page.redactions, 'statePaths']
	];
	for (const select of selectors)
		for (const enumerable of [true, false]) {
			const value = createInspectionCatalogFixture();
			check(api.isExactBuildInspectionCatalog(value), 'valid record control');
			const [parent, key] = select(value);
			const original = Object.getOwnPropertyDescriptor(parent, key)!.value;
			let reads = 0;
			Object.defineProperty(parent, key, {
				enumerable,
				get() {
					reads++;
					return original;
				}
			});
			check(
				!api.isExactBuildInspectionCatalog(value) && reads === 0,
				'accessor record rejected without executing it'
			);
		}
	for (const arrayField of ['files', 'components', 'children', 'reasons', 'statePaths'] as const) {
		const value = createInspectionCatalogFixture();
		const root = value.roots.page;
		const entity = root.files[0]!.components[0]!;
		let array: unknown[] =
			arrayField === 'files'
				? root.files
				: arrayField === 'components'
					? root.files[0]!.components
					: arrayField === 'statePaths'
						? root.redactions.statePaths
						: arrayField === 'children'
							? entity.children
							: [];
		if (arrayField === 'children') array.push({ ...entity, id: 'child', children: [] });
		if (arrayField === 'reasons') {
			array = [{ code: 'code', summary: 'summary', location: entity.location }];
			Object.defineProperty(entity, 'reasons', { value: array });
		}
		if (arrayField === 'statePaths') array.push('state.safe');
		check(api.isExactBuildInspectionCatalog(value), 'valid array control');
		const original = array[0];
		let reads = 0;
		Object.defineProperty(array, 0, {
			get() {
				reads++;
				return original;
			}
		});
		check(
			!api.isExactBuildInspectionCatalog(value) && reads === 0,
			'accessor array cell rejected without execution'
		);
	}
	const identity = {
		sessionId: 'session',
		side: 'client',
		buildKey: 'build',
		executionRoot: 'page',
		componentTypeId: 'component'
	};
	check(api.isExactInspectionRuntimeId(identity), 'valid runtime identity');
	for (const key of Object.keys(identity)) {
		let reads = 0;
		const original = Object.getOwnPropertyDescriptor(identity, key)!.value;
		const value = Object.defineProperty({ ...identity }, key, {
			get() {
				reads++;
				return original;
			}
		});
		check(
			!api.isExactInspectionRuntimeId(value) && reads === 0,
			'identity getter rejected without execution'
		);
	}
	const custom = createInspectionCatalogFixture();
	let iterations = 0;
	Object.defineProperty(custom.roots.page.files, Symbol.iterator, {
		get() {
			iterations++;
			throw new Error('iterator');
		}
	});
	check(
		!api.isExactBuildInspectionCatalog(custom) && iterations === 0,
		'authored iterator rejected without execution'
	);
	check(
		!api.isExactInspectionRuntimeId(Object.assign(Object.create({ side: 'client' }), identity)),
		'inherited behavior rejected'
	);
	const revoked = Proxy.revocable({}, {});
	revoked.revoke();
	check(!api.isExactInspectionRuntimeId(revoked.proxy), 'failed shape discovery rejected');
}
