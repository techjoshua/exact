const compiler = 'packages/compiler/src/';

/** Source obligation and contextual inference evidence across task type transformations. */
export const taskTypeWitnesses = [
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
			'source-owned task capture checking, paired valid and invalid controls, both targets',
		tests: ['client', 'server'].flatMap((target) =>
			['union', 'callback', 'contextual', 'nullable', 'readonly'].map(
				(name) => `preserves captured ${name} type obligations in tasks (${target})`
			)
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
