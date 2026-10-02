const compiler = 'packages/compiler/src/';

/** Paired module publication and lexical framework import behavior, with explicit invalid controls. */
export const moduleWitnesses = [
	{
		id: 'core-import-identity',
		file: compiler + 'compilation/core-import-identity.test.ts',
		environment:
			'native semantic checking, paired executable artifacts, SSR and jsdom local component updates and disposal',
		tests: [
			...[
				'Activity',
				'Cell',
				'Dynamic',
				'Fragment',
				'Portal',
				'Suspense',
				'Target',
				'Text',
				'UnsafeHtml'
			].flatMap((name) =>
				['client', 'server'].map(
					(target) => `preserves a local component alias shadowing core ${name} (${target})`
				)
			),
			...['client', 'server'].map(
				(target) => `preserves an ordinary same-named registry factory invocation (${target})`
			)
		]
	},
	{
		id: 'module-publication',
		file: compiler + 'library-build.test.ts',
		environment:
			'fresh library builds, paired target graphs, declaration relocation and failed-build cleanup',
		tests: [
			'builds a clean library with declarations, paired exports and deterministic metadata',
			'rebuilds transitive exports without stale module caches, and restores output after failure',
			'preserves NodeNext .mjs imports and declaration extensions',
			'retains selective-build support modules but removes maps for lowered modules',
			'emits authored declarations for named tasks with a component receiver',
			...['task assignment', 'ordinary receiver', 'ordinary assignment'].map(
				(name) => `retains authored validation for invalid ${name} during declaration emission`
			),
			'checks support modules omitted from selective lowering before emitting their declarations',
			'rejects server-only placement in a declared paired public component export',
			...['mts', 'mjs'].map(
				(extension) => `publishes paired .${extension} entry points and their component metadata`
			),
			...['cts', 'cjs'].map(
				(extension) => `rejects CommonJS .${extension} sources before replacing output`
			)
		]
	}
];
