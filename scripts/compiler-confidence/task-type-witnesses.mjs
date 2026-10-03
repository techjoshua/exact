const compiler = 'packages/compiler/src/';

/** Source obligation and contextual inference evidence across task type transformations. */
export const taskTypeWitnesses = [
	{
		id: 'task-imported-types',
		file: compiler + 'compilation/task-imported-types.test.ts',
		environment:
			'imported generic helpers, escaping callbacks, overloads and type assertions across checking and both targets',
		tests: ['default', 'client', 'server'].flatMap((target) =>
			[
				'generic helper',
				'escaped generic helper',
				'captured generic callable',
				'overload',
				'imported assertion',
				'imported satisfies',
				'imported readonly'
			].map((name) => `preserves ${name} obligations across imported task boundaries (${target})`)
		)
	},
	{
		id: 'task-generic-helper-runtime',
		file: compiler + 'compilation/task-generic-helper-runtime.test.ts',
		environment:
			'compiled helper identity, readonly authority, discard, next transaction, commit and ordinary calls through generic and expression-selected callable forms',
		tests: ['client', 'server'].flatMap((target) =>
			[
				'any returned callable',
				'any receiver factory',
				'immediate arrow',
				'immediate function',
				'chained returned factory',
				'computed returned callable',
				'constrained generic',
				'dependent callback',
				'escaped generic closure',
				'immediate nongeneric closure',
				'grouped returned closure',
				'asserted returned closure',
				'conditional returned closure',
				'optional returned closure',
				'conditional type',
				'mapped type',
				'assertion and satisfies'
			].map((name) => `preserves ${name} helper identity and transactional ownership (${target})`)
		)
	},
	{
		id: 'task-type-families',
		file: compiler + 'compilation/task-type-families.test.ts',
		environment:
			'authored type families through checking and both artifacts, with assertion/satisfies/assignment-result server executors',
		tests: ['default', 'client', 'server'].flatMap((target) =>
			[
				'conditional',
				'mapped',
				'template',
				'dependent',
				'intersection',
				'ambient',
				'assertion',
				'satisfies',
				'assignment-result',
				'module-generic-context',
				'module-generic-result'
			]
				.map((name) => `retains ${name} type obligations through task transformation (${target})`)
				.concat(
					[
						'assertion',
						'satisfies',
						'assignment-result',
						'module-generic-context',
						'module-generic-result'
					].map((name) => `retains ${name} type obligations in server task executors (${target})`)
				)
		)
	},
	{
		id: 'task-symbol-types',
		file: compiler + 'compilation/task-symbol-types.test.ts',
		environment:
			'client task unique-symbol results, checking/client/server artifacts, imported/private/shadowed identity controls',
		tests: ['default', 'client', 'server'].flatMap((target) =>
			[
				'local readonly property',
				'imported symbol',
				'private imported result',
				'shadowed symbol'
			].map((name) => `preserves ${name} identity in component task types (${target})`)
		)
	},
	{
		id: 'checked-javascript-task-types',
		file: compiler + 'compilation/checked-javascript-contracts.test.ts',
		environment:
			'checked JavaScript and JSX with JSDoc receivers/props, neutral proof and both targets, Node SSR and subsequent dispatch cleanup',
		tests: [
			...['js', 'jsx'].flatMap((extension) =>
				['default', 'client', 'server'].flatMap((target) =>
					['assignment', 'callback', 'contextual', 'union', 'readonly', 'nullable'].map(
						(name) => `preserves checked JavaScript ${name} obligations (${extension}, ${target})`
					)
				)
			),
			'executes checked JavaScript SSR and a subsequent task with owned cleanup'
		]
	},
	{
		id: 'task-nonmutating-types',
		file: compiler + 'compilation/task-nonmutating-types.test.ts',
		environment:
			'semantic checking of tasks without state mutations, neutral proof and both targets',
		tests: ['client', 'server'].flatMap((target) =>
			[
				'argument',
				'context',
				'generic',
				'genericContext',
				'promiseContext',
				'aliasContext',
				'recursiveContext',
				'untypedControl'
			].map((name) => `checks ${name} constraints in tasks without state mutations (${target})`)
		)
	},
	{
		id: 'task-capture-types',
		file: compiler + 'compilation/task-capture-types.test.ts',
		environment:
			'source-owned task capture checking, native readonly assignability controls, checking and both targets',
		tests: ['default', 'client', 'server'].flatMap((target) =>
			[
				'union',
				'callback',
				'contextual',
				'nullable',
				'readonly',
				'readonlyAlias',
				'mutableAlias',
				'shallowReadonly',
				'readonlyArray',
				'mutableHelperParameter'
			].map((name) => `preserves captured ${name} type obligations in tasks (${target})`)
		)
	},
	{
		id: 'task-fetch-types',
		file: compiler + 'compilation/task-fetch-contracts.test.ts',
		environment:
			'strict native fetch input/result checking, valid and invalid controls, both targets',
		tests: ['client', 'server'].map(
			(target) => `retains native fetch input and response types through task lowering (${target})`
		)
	}
];
