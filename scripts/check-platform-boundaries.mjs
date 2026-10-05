import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const entries = [
	{ name: '@exactjs/plugin-host', file: 'packages/plugin-host/dist/index.js', platform: 'browser' },
	{ name: '@exactjs/intl', file: 'packages/intl/dist/index.js', platform: 'browser' },
	{
		name: '@exactjs/accessibility',
		file: 'packages/accessibility/dist/index.js',
		platform: 'browser'
	},
	{ name: '@exactjs/server', file: 'packages/server/dist/index.js', platform: 'neutral' },
	{ name: '@exactjs/ssr', file: 'packages/ssr/dist/index.js', platform: 'neutral' }
];
const forbidden = [
	/(?:^|\/)packages\/plugin-host\/dist\/(?:node|registry|graph|discovery|configuration|modules)\.js$/,
	/(?:^|\/)packages\/(?:language-extension-api|language-extension-host|package-provenance|intl-analyzer)\/dist\//,
	/(?:^|\/)packages\/intl\/dist\/language\.js$/,
	/(?:^|\/)node_modules\/typescript\//
];

for (const entry of entries) {
	const result = await build({
		entryPoints: [path.join(root, entry.file)],
		bundle: true,
		format: 'esm',
		platform: entry.platform,
		target: 'es2022',
		write: false,
		metafile: true,
		logLevel: 'silent'
	});
	const inputs = Object.keys(result.metafile.inputs).map((file) => file.replaceAll('\\', '/'));
	const violations = inputs.filter((file) => forbidden.some((pattern) => pattern.test(file)));
	if (violations.length) {
		throw new Error(
			`${entry.name} runtime graph contains Node-only plugin preparation modules:\n${violations.join('\n')}`
		);
	}
	console.log(`${entry.name} runtime boundary ok (${inputs.length} modules)`);
}

// Capability entries must retain their registration while an ordinary renderer prunes
// their implementations. Parsed inputs alone do not prove that tree shaking kept code.
const capabilities = [
	['modal', 'modal/binding.js'],
	['root-release', 'renderer/retained-release-integration.js'],
	['target', 'target-integration.js'],
	['unsafe-html', 'unsafe-html-integration.js'],
	['text-host', 'text-host-integration.js'],
	['structural-boundaries', 'structural-integration.js']
];
for (const [entry, implementation] of capabilities) {
	for (const selected of [false, true]) {
		const result = await build({
			stdin: {
				contents: selected
					? `import '@exactjs/dom/runtime/${entry}';`
					: `export {render} from '@exactjs/dom';`,
				resolveDir: root,
				sourcefile: 'dom-capability-probe.mjs'
			},
			bundle: true,
			format: 'esm',
			platform: 'browser',
			target: 'es2022',
			write: false,
			metafile: true,
			logLevel: 'silent'
		});
		const retained = Object.values(result.metafile.outputs).some((output) =>
			Object.entries(output.inputs).some(
				([file, record]) =>
					file.replaceAll('\\', '/').endsWith('/' + implementation) && record.bytesInOutput > 0
			)
		);
		if (retained !== selected)
			throw new Error(
				`DOM ${entry} capability ${selected ? 'registration was pruned' : 'implementation leaked into the plain renderer'}`
			);
	}
	console.log(`@exactjs/dom ${entry} selection and pruning ok`);
}
