const compiler = 'packages/compiler/src/';

/** Names the source-task and render-chain assertions required in fresh confidence reports. */
export const taskStateWitnesses = [
	{
		id: 'optional-chain-render-flow',
		file: compiler + 'compilation/optional-chain-flow.test.ts',
		environment: 'paired SSR, strict hydration, retained member/element updates and disposal',
		tests: ['member', 'literal element'].map(
			(selector) => `preserves optional non-null render flow through a ${selector}`
		)
	},
	{
		id: 'task-state-contracts',
		file: compiler + 'compilation/task-state-regressions.test.ts',
		environment: 'paired artifacts, direct SSR and repeated client task execution',
		tests: [
			'nested present optional argument reads staged component state',
			'nested optional computed key reads staged component state',
			'nested optional native call argument reads staged component state',
			'optional non-null continuation skips an absent receiver',
			'optional non-null state continuation skips an absent receiver',
			'optional state preparation skips an absent receiver on later invocations',
			'captured optional state continuation skips an absent receiver',
			'captured optional computed state continuation skips an absent receiver',
			'captured optional aliased state continuation skips an absent receiver',
			'captured optional state call retains a present receiver',
			'captured optional assertion before a state member skips an absent receiver',
			'optional computed selector skips key effects for an absent state receiver',
			'optional computed selector evaluates its key once for present staged state',
			'unchanged helper preserves optional non-null short circuit',
			'parenthesized optional non-null chain keeps its authored break',
			'native date readers preserve their receiver brand',
			'captured nested state helper remains pending before success',
			'captured deep state helper remains pending before success',
			'nested helper binding defaults consume pending values',
			'computed helper binding keys consume pending values',
			'destructured helper objects and arguments retain authored identity',
			'borrowed call collection results stay pending',
			'bound native member collection results stay pending',
			'parent then awaited child',
			'child then parent replacement',
			'repeated scalar writes',
			'parent then child prefix',
			'parent then logical child',
			'parent replacement',
			'conditional parent replacement',
			'parent then child',
			'conditional local write',
			'conditional predecessor',
			'uncalled predecessor',
			'assignment RHS predecessor',
			'conditional predecessor replacement',
			'short circuit predecessor',
			'ordered scalar reads',
			'ordered collection reads',
			'ordered nested reads',
			'literal capture',
			'state capture',
			'object capture',
			'tuple capture',
			'dependent capture'
		].map((name) => `preserves '${name}' in direct SSR and client tasks`)
	}
];
