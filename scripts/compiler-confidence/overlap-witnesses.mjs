const compiler = 'packages/compiler/src/';
const corpus = 'packages/component-composition-corpus/src/';

/** Executed contracts that cross props, pending helpers, derived types and owner teardown. */
export const overlapWitnesses = [
	{
		id: 'type-only-policy-overlap',
		file: compiler + 'native/type-only-policy-overlap.test.ts',
		environment:
			'checking/client/server, task type queries, imported protected/public values, source/declaration exports and native helpers',
		tests: [
			...['client', 'server'].map(
				(placement) =>
					`preserves type-only browser queries inside ${placement} tasks while checking executable reads`
			),
			...['server', 'secret'].flatMap((policy) =>
				['source', 'declaration'].map(
					(form) =>
						`keeps imported ${policy} ${form} type queries separate from forbidden client value reads`
				)
			)
		]
	},
	{
		id: 'pending-owner-sequences',
		file: corpus + 'pending-owner-overlap.test.ts',
		environment:
			'48-action seeded committed-state and owner models in paired mount/hydration with enhanced/plain hosts',
		tests: ['mount', 'hydrate'].flatMap((entry) =>
			[false, true].flatMap((enhanced) =>
				[17, 99].map(
					(seed) =>
						`${entry}/enhanced=${enhanced}/seed=${seed}: preserves ownership across bounded task and prop sequences`
				)
			)
		)
	},
	{
		id: 'pending-owner-overlap',
		file: corpus + 'pending-owner-overlap.test.ts',
		environment:
			'paired mount/hydration, defaulted props, ordinary helper transactions, enhanced host identity, keyed replacement and disposal',
		tests: ['mount', 'hydrate'].flatMap((entry) =>
			[false, true].map(
				(enhanced) =>
					`${entry}/enhanced=${enhanced}: fences pending helpers across prop rebinding and keyed ownership`
			)
		)
	},
	{
		id: 'derived-reference-identity',
		file: compiler + 'native/derived-reference-identity.test.ts',
		environment:
			'checking/client/server, external declaration offsets and native type/typeof preservation',
		tests: [
			'keeps type-only browser queries out of component placement',
			...['value', 'type', 'query'].map(
				(form) =>
					`keeps imported ${form} declarations separate from colliding local derived positions`
			),
			...['local', 'qualified', 'shadowed utility', 'instantiated function'].map(
				(form) => `preserves ${form} type queries of retained derived values`
			)
		]
	},
	{
		id: 'disposed-derived-values',
		file: 'packages/reactive/src/computation.test.ts',
		environment:
			'lazy stopped values, frozen cached values, detached dependency graph and failure recovery',
		tests: [
			'reads an unused disposed value once without reviving subscriptions or changing cached values',
			'detects stopped lazy cycles and restores stopped state after a failed cleanup read',
			'reads an unused stopped dependency chain without connecting it to a live observer'
		]
	}
];
