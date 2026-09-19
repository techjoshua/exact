import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Rejects registry copies of eXact before building or measuring this workspace. Resolution is
 * checked from the harness and each participant, where nested dependencies can shadow root links.
 * Returns the actual package identities for capture provenance; it never loads built modules.
 */
export function assertComparisonWorkspaceDependencies(
	repository = resolve(import.meta.dirname, '../..')
) {
	const suite = resolve(repository, 'framework-comparison');
	const manifest = JSON.parse(readFileSync(resolve(suite, 'package.json'), 'utf8'));
	const expected = new Map();
	for (const directory of ['packages', 'framework-adapters']) {
		for (const entry of readdirSync(resolve(repository, directory), { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const root = resolve(repository, directory, entry.name);
			let metadata;
			try {
				metadata = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
			} catch (error) {
				if (error.code === 'ENOENT') continue;
				throw error;
			}
			expected.set(metadata.name, { root: realpathSync(root), version: metadata.version });
		}
	}
	const origins = [
		'src/build-exact.mjs',
		'src/ssr-benchmark-worker.mjs',
		'participants/exact/src/server-entry.tsx',
		'participants/exact/dist-server/server-entry.js',
		'participants/exact/dist-bun-server/bun-server-entry.js',
		'participants/exact-native/src/server.ts'
	];
	const evidence = [];
	for (const origin of origins) {
		const require = createRequire(resolve(suite, origin));
		for (const name of Object.keys(manifest.dependencies).filter((name) =>
			name.startsWith('@exactjs/')
		)) {
			const workspace = expected.get(name);
			if (!workspace) throw new Error(`Unknown comparison workspace dependency ${name}`);
			const entry = realpathSync(require.resolve(name));
			const child = relative(workspace.root, entry);
			if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child))
				throw new Error(
					`Comparison ${origin} resolves ${name} outside its workspace: ${entry}. ` +
						`Expected ${workspace.root}; update dependency ranges and reinstall before benchmarking.`
				);
			evidence.push({
				origin,
				name,
				version: workspace.version,
				entry: relative(repository, entry)
			});
		}
	}
	return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
	console.log(JSON.stringify(assertComparisonWorkspaceDependencies(), null, 2));
