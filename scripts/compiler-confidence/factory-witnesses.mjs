const compiler = 'packages/compiler/src/';

/** Fresh execution witnesses for callable creation, retained ownership and subsequent transactions. */
export const factoryWitnesses = [
	{
		id: 'helper-module-ownership',
		file: compiler + 'native/ordinary-module-ownership.test.ts',
		environment:
			'host-owned bootstrap source, strict producer controls and native component placement across targets',
		tests: ['client', 'server'].flatMap((target) => [
			`preserves host-owned bootstrap effects without weakening component placement (${target})`,
			`retains secret consumption policy in host-owned helpers (${target})`
		])
	},
	{
		id: 'helper-module-selection',
		file: compiler + 'adapter-support.test.ts',
		environment:
			'shared adapter source filters, virtual and generated exclusions, React ownership and JavaScript helper type erasure',
		tests: [
			'selects callable helper modules while retaining path and data-only controls',
			'validates server components after native analysis for client mode',
			'validates client components after native analysis for server-render mode',
			'retains react ownership for callable modules without JSX',
			'retains unknown ownership for callable modules without JSX',
			...['js', 'mjs', 'jsx'].map(
				(extension) => `emits executable ${extension} helper companions with authored source maps`
			)
		]
	},
	{
		id: 'helper-factories',
		file: compiler + 'compilation/task-helper-factories.test.ts',
		environment:
			'client and server artifacts, ordinary and pending creation, discard and subsequent invocation',
		tests: [
			'contextually typed arrow',
			'returned arrow',
			'returned function',
			'local arrow',
			'local declaration',
			'parameterized arrow',
			'bound method'
		].flatMap((name) =>
			['ordinary', 'pending'].flatMap((creation) =>
				['client', 'server'].map(
					(target) =>
						`retains ${name} across ${creation} factory creation and subsequent invocation (${target})`
				)
			)
		)
	},
	{
		id: 'helper-factory-transitions',
		file: compiler + 'compilation/task-helper-factory-transitions.test.ts',
		environment:
			'client and server artifacts, readonly creation policy, lexical home, native binding and contextual types',
		tests: [
			'retains contextual parameter types in a callable class field',
			'preserves ordinary factory constructor identity and prototype',
			'retains anonymous factory class home after its variable changes',
			'retains a public factory home with a borrowed ordinary receiver',
			'retains lexical super in a private factory closure',
			'selects subsequent ownership for a factory-created async helper',
			'retains readonly creation policy in an escaped private lexical closure',
			'retains constructor-created native binding',
			'preserves readonly ownership in a factory-initialized callable field',
			'retains distinct loop-created binding receivers and prefixes',
			'retains ordinary binding in a parameter default',
			'retains binding arguments across authored suspension',
			'preserves an overridden bind selection',
			'retains native optional binding and its absent control'
		].flatMap((name) => ['client', 'server'].map((target) => `${name} (${target})`))
	},
	{
		id: 'helper-factory-routing',
		file: 'packages/reactive/src/pending/helper-factory-routing.test.ts',
		environment:
			'current transaction selection for extracted members with cached readonly and writable aliases',
		tests: [
			...[false, true].map(
				(first) =>
					`retains extracted receiver policy after another alias is cached, readonly first=${first}`
			),
			...['Array', 'Map'].map(
				(kind) => `selects the current transaction for an extracted native ${kind} operation`
			)
		]
	}
];
