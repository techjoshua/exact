const compiler = 'packages/compiler/src/compilation/';

/** Native assignment and implicit getter consumers must retain invocation ownership and authored evaluation. */
export const evaluationWitnesses = [
	{
		id: 'task-super-reference-order',
		file: compiler + 'task-super-reference-order.test.ts',
		environment:
			'native authored versus pending inherited assignments with prototype replacement during RHS/default evaluation',
		tests: ['client', 'server'].flatMap((target) =>
			['direct', 'pattern'].map(
				(name) => `retains native super prototype replacement during ${name} assignment (${target})`
			)
		)
	},
	{
		id: 'task-helper-never-types',
		file: compiler + 'task-helper-never-types.test.ts',
		environment:
			'declared never versus void termination through source checking and both task targets',
		tests: ['default', 'client', 'server'].flatMap((target) =>
			['direct', 'arrow', 'generic'].map(
				(name) => `retains ${name} never-returning helper control flow (${target})`
			)
		)
	},
	{
		id: 'task-assignment-pattern-types',
		file: compiler + 'task-assignment-pattern-types.test.ts',
		environment:
			'paired numeric/private/readonly assignment constraints through checking and both executable targets',
		tests: ['default', 'client', 'server'].flatMap((target) =>
			['nested', 'loop', 'private', 'readonly'].map(
				(name) =>
					`retains ${name} assignment constraints at native reference boundaries (${target})`
			)
		)
	},
	{
		id: 'task-helper-evaluation',
		file: compiler + 'task-helper-evaluation.test.ts',
		environment:
			'differential authored JavaScript versus pending helper execution, both targets, discard and subsequent commit',
		tests: ['client', 'server'].flatMap((target) =>
			[
				'nested destructuring destinations',
				'for-of assignment destination',
				'for-in assignment destination',
				'computed destination default order',
				'rest assignment destination',
				'partial assignment before failure',
				'assignment result identity',
				'sparse array defaults',
				'iterator close on break',
				'iterator close on throw',
				'iterator close on destructuring',
				'getter spread and default order',
				'getter direct read',
				'copied reference identity',
				'copied callable identity',
				'computed getter copy',
				'getter exception ordering',
				'local setter captured writes',
				'logical assignment selection',
				'assignment expression result',
				'optional and logical selection'
			].map((name) => `retains ${name} evaluation through pending helpers (${target})`)
		)
	},
	{
		id: 'task-private-assignment-patterns',
		file: compiler + 'task-private-assignment-patterns.test.ts',
		environment:
			'branded private field/accessor assignment through array/object/default/loop targets, isolation, discard, subsequent commit and readonly authority',
		tests: ['client', 'server'].flatMap((target) =>
			[
				'array destination',
				'object destination',
				'array default',
				'loop destination',
				'accessor destination',
				'super destination'
			].map((name) => `preserves private ${name} assignment ownership (${target})`)
		)
	},
	{
		id: 'native-copy-view',
		file: 'packages/reactive/src/pending/copy-view.test.ts',
		environment:
			'explicit pending copy engine, frozen properties, original reference/function identity, external read semantics and custom source key order',
		tests: [
			'copies compiled getter results without changing reference or callable identity',
			'retains external proxy read semantics without descriptor inspection',
			'copies frozen nested references and original functions from owned sources',
			'preserves custom source key order during native copying'
		]
	}
];
