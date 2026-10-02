const adapter = 'framework-adapters/';
const modes = [
	'authored',
	'paired',
	'partitioned',
	'partitioned-stream',
	'server-shell',
	'server-shell-stream',
	'continuation-shell',
	'continuation-shell-stream'
];
const installedModes = ['authored', 'paired', 'published', 'library'];

/** Exact existing adapter tests, selected independently of fixture mode declarations. */
export const adapterWitnesses = ['vite', 'webpack', 'bun'].flatMap((host) => {
	const native = host === 'bun';
	const file = adapter + host + '-plugin/src/';
	return [
		{
			id: host + '-installed-split-islands',
			file: file + 'installed-islands.integration.test.ts',
			environment:
				host +
				' physical installed paired library, source removed, private registry child, split hydration and continuations',
			tests: [
				...['false', 'true'].map(
					(stream) => `preserves independently installed split islands, streaming=${stream}`
				),
				...['missing-facts', 'incompatible-facts', 'missing-client'].map(
					(fault) => `rejects invalid installed split islands, fault=${fault}`
				)
			]
		},
		{
			id: host + '-helper-modules',
			file:
				file +
				(native ? 'bun.integration.test.ts' : 'project-source-isolation.integration.test.ts'),
			environment:
				host +
				' client/server bundles, ordinary TS/JS helpers, readonly aliases, discard and subsequent publication',
			tests: ['isolates unrelated project initializers in both artifacts']
		},
		{
			id: host + '-installed-enhancements',
			file:
				file + (native ? 'bun.integration.test.ts' : 'installed-enhancements.integration.test.ts'),
			environment:
				host +
				' physical installed packages, authored/paired/published/library SSR, provider ownership',
			tests: installedModes.map((mode) =>
				host === 'vite'
					? `renders installed enhancements and module-owned formatters in production (${mode})`
					: host === 'webpack'
						? `renders installed enhancements with Webpack (${mode})`
						: `renders installed themes and excludes denied providers (${mode})`
			)
		},
		{
			id: host + '-split-hydration',
			file: file + (native ? 'bun.integration.test.ts' : 'motion-ssr.integration.test.ts'),
			environment:
				host +
				' built workspace bundles, jsdom hydration, split islands, buffered/progressive shells and continuations',
			tests: modes.map((mode) =>
				host === 'vite'
					? `retains enhancement linkage and hydration ownership (${mode})`
					: `preserves SSR and hydration with ${host === 'bun' ? 'Bun' : 'Webpack'} (${mode})`
			)
		}
	];
});

/** Representative native HTTP checks completed separately for each required host configuration. */
export const runtimeWitnesses = [
	'node',
	'bun',
	'deno (default abort)',
	'deno (modern abort)',
	'cloudflare'
].map((host) => ({
	id: 'native-runtime-' + host,
	runner: 'native-runtime',
	environment: host + ' native HTTP and browser hydration',
	tests: ['native-progress', 'dispatch-policy', 'browser-hydration']
}));

/** Environment evidence is separate from compiler syntax and installed split-build completeness. */
export const environmentEdges = [
	{
		id: 'application-helper-adapters',
		kind: 'contract',
		owner: 'shared adapter selection -> host bundler -> pending helper engine',
		producer:
			'Preserve ordinary helper source and select component-support emission without weakening placement or secret policy.',
		consumer:
			'Run ordinary TS/JS helpers with supplied state inputs and current transaction ownership.',
		witnesses: ['vite', 'webpack', 'bun'].map((host) => host + '-helper-modules'),
		limit:
			'Shared client/server fixture. Checked-JavaScript components and CommonJS application helpers remain outside this evidence.'
	},
	{
		id: 'installed-enhancement-consumers',
		kind: 'contract',
		owner: 'installed library artifacts -> bundler provider resolution -> SSR',
		producer: 'Publish portable enhancement and component facts.',
		consumer:
			'Resolve physical installed packages and retain enhancement ownership in server output.',
		witnesses: ['vite', 'webpack', 'bun'].map((host) => host + '-installed-enhancements'),
		limit:
			'Four installed SSR artifact forms. Provider-excluded/absent controls run in Bun and Webpack. This does not establish installed split-island hydration.'
	},
	{
		id: 'workspace-split-build-adapters',
		kind: 'contract',
		owner: 'workspace paired bundles -> split islands -> jsdom adoption',
		producer: 'Preserve activation metadata and enhancement topology across target bundles.',
		consumer: 'Adopt, update and dispose independent islands across buffered/progressive shells.',
		witnesses: ['vite', 'webpack', 'bun'].map((host) => host + '-split-hydration'),
		limit:
			'Eight named workspace scenarios per adapter. Installed libraries, arbitrary topology and real-browser event behavior remain separate.'
	},
	{
		id: 'native-http-runtime-boundaries',
		kind: 'contract',
		owner: 'server transport -> dispatch and serialization -> browser activation',
		producer:
			'Carry authorization, request lifetime, ownership and hydration contracts across native hosts.',
		consumer:
			'Preserve progress, reject invalid dispatch and hydrate buffered/progressive output with cleanup.',
		witnesses: runtimeWitnesses.map((witness) => witness.id),
		limit:
			'Representative shared HTTP/browser journey in the recorded browser engine. Provider deployment behavior and other browser engines are separate.'
	}
];
