import assert from 'node:assert/strict';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Checks public-export selection and physical containment using an owned installed package. */
export async function verifyPackageExportContainment(api, root) {
	const location = path.join(root, 'node_modules', '@fixture', 'exports');
	await mkdir(location, { recursive: true });
	await writeFile(
		path.join(location, 'package.json'),
		JSON.stringify({
			name: '@fixture/exports',
			type: 'module',
			exports: {
				'.': './entry.js',
				'./dots': './..entries/value.js',
				'./private': null
			}
		})
	);
	await mkdir(path.join(location, '..entries'), { recursive: true });
	await writeFile(path.join(location, 'entry.js'), 'export const value = "ordinary";');
	await writeFile(path.join(location, '..entries/value.js'), 'export const value = "dot-prefix";');
	await writeFile(path.join(location, 'private.js'), 'export const value = "private";');
	const node = {
		location,
		realPath: await realpath(location),
		manifest: { name: '@fixture/exports' }
	};
	assert.equal((await api.importExactPublicPackageEntry(node, '.')).value, 'ordinary');
	assert.equal((await api.importExactPublicPackageEntry(node, './dots')).value, 'dot-prefix');
	assert.throws(() => api.resolveExactPublicPackageEntry(node, './private'), /Unable to resolve/);
	assert.throws(
		() => api.resolveExactPublicPackageEntry(node, './private.js'),
		/Unable to resolve/
	);
	// A different physical owner cannot borrow another package's otherwise public entry.
	assert.throws(
		() =>
			api.resolveExactPublicPackageEntry({ ...node, realPath: path.join(location, 'nested') }, '.'),
		/outside/
	);
	for (const name of ['', 42])
		assert.throws(
			() => api.resolveExactPublicPackageEntry({ ...node, manifest: { name } }, '.'),
			/must declare a package name/
		);
	let reads = 0;
	const captured = {
		...node,
		manifest: {
			get name() {
				return ++reads === 1 ? '@fixture/exports' : undefined;
			}
		}
	};
	assert.equal(
		api.resolveExactPublicPackageEntry(captured, '.'),
		path.join(node.realPath, 'entry.js')
	);
	assert.equal(reads, 1);
}
