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
			'leaves ordinary callable modules with the host while retaining component filters',
			'validates server components after native analysis for client mode',
			'validates client components after native analysis for server-render mode',
			'retains react ownership for callable modules without JSX',
			'retains unknown ownership for callable modules without JSX',
			...['js', 'mjs', 'jsx'].map(
				(extension) => `preserves ordinary ${extension} helpers with authored source maps`
			)
		]
	},
	{
		id: 'component-branding-ownership',
		file: compiler + 'compilation/component-intrinsics.test.ts',
		environment: 'client mounting/server rendering with module Object/Symbol bindings',
		tests: ['client', 'server'].map(
			(target) => `preserves ${target} component contracts with module built-in bindings`
		)
	},
	{
		id: 'enhancement-metadata-ownership',
		file: compiler + 'compilation/enhancement-intrinsics.test.ts',
		environment:
			'client/server late-token metadata, Object/Symbol shadows and invalid value controls',
		tests: ['client', 'server'].flatMap((target) => [
			...['Object', 'Symbol'].map(
				(name) => `preserves enhancement metadata with authored ${name} (${target})`
			),
			`retains invalid enhancement context value diagnostics (${target})`,
			`retains transitive enhancement tokens with authored Reflect (${target})`
		])
	}
];
