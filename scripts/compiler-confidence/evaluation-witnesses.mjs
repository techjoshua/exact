const compiler = 'packages/compiler/src/compilation/';

/** Native assignment and implicit getter consumers must retain invocation ownership and authored evaluation. */
export const evaluationWitnesses = [
	{
		id: 'task-escaped-accessors',
		file: compiler + 'task-escaped-accessors.test.ts',
		environment:
			'escaped own/computed/inherited accessor and method captures after creator closure, subsequent discard/commit and readonly aliases',
		tests: ['client', 'server'].flatMap((target) =>
			[
				'literal getter',
				'computed string getter',
				'computed symbol getter',
				'computed unique holder getter',
				'computed setter',
				'computed method',
				'computed getter replacement',
				'computed getter setter pair',
				'computed setter getter pair',
				'async computed getter',
				'generator computed getter',
				'inherited getter',
				'module inherited getter',
				'module inherited setter',
				'inherited setter'
			].map((name) => `selects current ownership for escaped ${name} (${target})`)
		)
	},
	{
		id: 'task-local-class-ownership',
		file: compiler + 'task-local-class-ownership.test.ts',
		environment:
			'factory-local class originals and companion invocation after creator closure, native shape and external private storage semantics',
		tests: ['client', 'server'].flatMap((target) =>
			['declaration', 'expression', 'inheritance', 'field', 'private'].map(
				(name) => `retains local class ${name} originals after creator closure (${target})`
			)
		)
	},
	{
		id: 'task-helper-object-types',
		file: compiler + 'task-helper-object-types.test.ts',
		environment:
			'paired method/accessor/constructor and unique symbol type obligations through checking and both executable targets',
		tests: ['default', 'client', 'server'].flatMap((target) =>
			['method', 'accessor', 'unique method', 'unique property', 'constructor'].map(
				(name) => `retains ${name} constraints through helper object registration (${target})`
			)
		)
	},
	{
		id: 'native-helper-object-capture',
		file: 'packages/reactive/src/pending/helper-object-capture.test.ts',
		environment:
			'actual symbol key coercion, final accessor pairing, native proxy copying order and primitive controls',
		tests: [
			'captures symbol-producing names once and pairs computed accessors',
			'rejects overwritten companion ownership while retaining the final accessor pair',
			'preserves native proxy spread order, getter receiver and enumerability',
			'retains nullish and primitive spread behavior'
		]
	},
	{
		id: 'native-unowned-helper-methods',
		file: 'packages/reactive/src/pending/unowned-helper-methods.test.ts',
		environment:
			'unowned compiled captures, getter-selected and explicit callables, ordinary unknown getter evaluation, discard and next commit',
		tests: [
			'selects current captures for a compiled method on external storage',
			'selects a compiled getter and its returned method once',
			'retains explicit method selection without evaluating an external getter',
			'evaluates an unknown noncallable external getter once before invocation fails'
		]
	},
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
				'dynamic method overwrite',
				'spread method overwrite',
				'spread excludes hidden replacements',
				'dynamic accessor pairing',
				'computed prototype property',
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
