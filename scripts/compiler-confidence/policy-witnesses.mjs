const compiler = 'packages/compiler/src/';

/** Resolved data-policy contracts at component reads, consumers and disclosure boundaries. */
export const policyWitnesses = [
	{
		id: 'inferred-secret-task-placement',
		file: compiler + 'policy-task-consumption.test.ts',
		environment:
			'checking/client/server qualification-driven placement with opaque-call limits retained',
		tests: ['default', 'client', 'server'].map(
			(target) => `infers server task placement from a qualified local binding (${target})`
		)
	},
	{
		id: 'server-task-secret-execution',
		file: compiler + 'policy-task-consumption.test.ts',
		environment:
			'checking/client/server function task capabilities and execution placement with retained client code rejection',
		tests: [
			...['default', 'client', 'server'].map(
				(target) => `audits secret consumption at function-task execution placement (${target})`
			),
			'continues rejecting secret consumption in code retained by the client artifact',
			'does not treat a secret result as a public task invocation capability',
			...['default', 'client', 'server'].map(
				(target) => `rejects client task access to local and callable secret facts (${target})`
			)
		]
	},
	{
		id: 'generated-task-secret-wire',
		file: compiler + 'compilation/distributed-continuation-loopback.test.ts',
		environment:
			'generated paired artifacts and local dispatcher, batched/unbatched request and response bytes inspected before hydration transport receives them',
		tests: [false, true].map(
			(batch) =>
				`keeps credentials out of generated task request and response bytes (batch: ${batch})`
		)
	},
	{
		id: 'callable-result-policy',
		file: compiler + 'policy-call-results.test.ts',
		environment:
			'checking/client/server callable symbol ownership, imported declarations and selected overload results',
		tests: [
			'protects imported and callable-variable secret results at every component output target',
			'keeps identically named callable returns separate across receivers',
			'retains explicit imported secret annotations even when the native return type is ordinary',
			'preserves public projections of recursive secret-bearing callable results',
			'keeps secret type contracts authoritative over declaration placement annotations',
			'protects imported accessor values and literal member names without qualifying public siblings',
			'preserves selected generic result and member qualification across public and private instances',
			'protects native constructor and tagged-template result contracts',
			'authorizes secret constructor arguments and tag substitutions at their native parameter positions',
			'keeps inline values out of qualified result identity metadata'
		]
	},
	{
		id: 'secret-receipt-policy',
		file: compiler + 'policy-receipts.test.ts',
		environment:
			'declared receipt, callbacks, writes and private execution requirements across checking/client/server',
		tests: [
			'requires declared secret authority across generic and rest receipt contracts',
			'retains native contextual secret parameters without qualifying public callbacks',
			'checks forwarded and spread secret receipt against every declared position',
			'preserves secret binding leaves and defaults while permitting direct public siblings',
			'retains private receivers as client task execution requirements',
			'rejects secret erasure through assignment and iteration destinations',
			'protects secret-controlled writes across native operators and selectors'
		]
	},
	{
		id: 'aliased-component-policy',
		file: compiler + 'policy-type-boundaries.test.ts',
		environment:
			'checking/client/server finite keys, imported residency and named remote write authority with rejected controls',
		tests: [
			'preserves direct, aliased and readonly finite registry keys while rejecting unproven keys',
			'preserves imported residency annotations through aliases and readonly views',
			'keeps finite named remote writes distinct from diagnosed computed authority through type aliases'
		]
	},
	{
		id: 'secret-type-policy',
		file: compiler + 'policy-emission.test.ts',
		environment:
			'resolved secret qualification, aliases, imported members, aggregate/indexed data and disclosure controls',
		tests: ['default', 'client', 'server']
			.flatMap((target) =>
				[
					'direct',
					'alias',
					'generic alias',
					'readonly alias',
					'intersection alias',
					'nullable alias'
				].map((name) => `preserves ${name} secret qualification at component output (${target})`)
			)
			.concat([
				'authorizes aliased secret parameters while rejecting ordinary lookalike parameters',
				'keeps similarly named ordinary types unqualified',
				'tracks imported readonly fields and method results without tainting public siblings',
				'protects secret-containing records and arrays while allowing public field selection',
				'applies secret type contracts to component state task placement',
				'preserves secret contracts introduced by native interface augmentation',
				'rejects unconsumed secrets in native operation children, attributes, and spreads',
				'allows consume() to end tracking before deliberate server operation output'
			])
	},
	{
		id: 'secret-server-render-containment',
		file: 'packages/component-composition-corpus/src/secret-containment.test.ts',
		environment:
			'compiled server-owned credentials, buffered hydration and streamed response bytes without client execution',
		tests: [
			'keeps server credentials out of buffered HTML and hydration records before client execution',
			'keeps server credentials out of every stream output chunk before client execution',
			'keeps server credentials out of every progressive output chunk before client execution'
		]
	}
];
