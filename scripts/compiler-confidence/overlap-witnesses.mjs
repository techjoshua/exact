const compiler = 'packages/compiler/src/';
const corpus = 'packages/component-composition-corpus/src/';

/** Executed contracts that cross props, pending helpers, derived types and owner teardown. */
export const overlapWitnesses = [
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
