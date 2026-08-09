import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const entries = [
	{ name: '@exactjs/plugin-host', file: 'packages/plugin-host/dist/index.js', platform: 'browser' },
	{ name: '@exactjs/intl', file: 'packages/intl/dist/index.js', platform: 'browser' },
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
