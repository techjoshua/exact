const compiler = 'packages/compiler/src/';

/** Names the source-task and render-chain assertions required in fresh confidence reports. */
export const taskStateWitnesses = [
	{
		id: 'task-resource-control-flow',
		file: compiler + 'compilation/task-resource-control-flow.test.ts',
		environment: 'mount, strict hydration, repeated execution, cancellation and disposal',
		tests: [
			'immediate resource result',
			'nonnull immediate resource result',
			'direct resource disposal',
			'direct optional resource disposal',
			'direct optional defined disposal',
			'direct throwing disposal',
			'destructured resource context',
			'context binding collision',
			'closure resource',
			'wrapped cleanup alias',
			'awaited wrapped cleanup'
		].flatMap((release) =>
			['mount', 'hydrate'].flatMap((mode) =>
				['nonblocking', 'blocking'].map(
					(readiness) =>
						`retains fallback ownership across executed control flow: '${release}' ('${mode}', '${readiness}')`
				)
			)
		)
	},
	{
		id: 'task-owner-omission',
		file: compiler + 'compilation/task-state-regressions.test.ts',
		environment: 'stateless client timer ownership and parameterized server task omission',
		tests: [
			'runs stateless task timers through the generated component owner',
			'retains parameterized client task omission in server work',
			'preserves wrapped policy definitions through repeated blocking work',
			'rejects erased server collection publication before dispatch'
		]
	},
	{
		id: 'task-activation-captures',
		file: compiler + 'compilation/task-activation-captures.test.ts',
		environment:
			'direct SSR, real server dispatch, repeated captures, context publication, retained updates and removal',
		tests: [
			'destructured server optimistic context',
			'ordinary awaited subscription result',
			'void',
			'undefined',
			'null',
			'number',
			'false',
			'zero',
			'direct context default',
			'aliased context default',
			'helper context read',
			'helper context write',
			'helper constant',
			'nullable server collection',
			'absent nullable server collection',
			'null server collection',
			'optional null server receiver',
			'optional null parameter helper',
			'asserted helper capture',
			'parenthesized helper capture',
			'helper object',
			'helper overload',
			'helper block shadow',
			'helper props',
			'helper tuple spread',
			'helper derived scalar',
			'helper derived object',
			'awaited server resource',
			'wrapped server resource',
			'nested server resource',
			'explicit server resource release',
			'optional server resource release',
			'server subscription resource',
			'server task signal injection',
			'server timer cancellation',
			'helper nested state alias',
			'immediate context helper',
			'unused context helper'
		].map(
			(name) =>
				`preserves captured defaults with local helpers and server context ('${name}' result)`
		)
	},
	{
		id: 'task-pending-expressions',
		file: compiler + 'compilation/task-state-regressions.test.ts',
		environment: 'pending task cells, native expression order, repeated publication and disposal',
		tests: [
			'pending object copy',
			'pending member deletion',
			'pending computed deletion',
			'pending array spread',
			'pending for-of receiver',
			'pending inline member helper',
			'pending ordinary awaited assignment',
			'pending private call initializer',
			'pending private getter order',
			'pending private static initializer',
			'pending private optional call',
			'pending absent private optional call',
			'pending private optional getter order',
			'pending private helper state arguments',
			'pending member template tag',
			'pending computed template tag'
		].map((name) => `preserves '${name}' in direct SSR and client tasks`)
	},
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
			'render helper overloads survive task projection',
			'captured original Map remains outside supplied view',
			'supplied Map helper view observes pending edits',
			'supplied Set helper view observes pending edits',
			'supplied Array helper view observes pending edits',
			'explicit reactive cell task input',
			'mutable ordinary helper alias',
			'whole component helper read',
			'whole component state helper read',
			'adjacent reactive setup compact',
			'adjacent reactive setup spaced',
			'adjacent reactive setup newline',
			'adjacent reactive setup commented',
			'erased client Map pending publication',
			'immediate resource result remains generation owned',
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
			'scalar suspended parent replacement',
			'suspended for scalar publication',
			'suspended for-in scalar publication',
			'suspended for-of scalar publication',
			'suspended while scalar publication',
			'suspended do scalar publication',
			'native super destructuring targets',
			'native private destructuring target',
			'native indexed destructuring default',
			'named task indexed destructuring default',
			'function expression task receiver',
			'implicit locale in task work',
			'lexical super field selection',
			'lexical computed super selection',
			'whole parameter Map pending writes',
			'whole parameter Set pending writes',
			'server local empty literal state key',
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
