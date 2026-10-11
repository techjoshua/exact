import { cp, mkdir, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

/** Copies runtime dependency graphs physically so fixture resolution cannot escape to workspace sources. */
export async function copyInstalledRuntimePackages(root: string, names: readonly string[]) {
	const workspace = fileURLToPath(new URL('../../', import.meta.url));
	const copied = new Set<string>();
	async function copy(name: string): Promise<void> {
		if (copied.has(name)) return;
		copied.add(name);
		const source = path.join(workspace, 'node_modules', name);
		const manifest = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
		const destination = path.join(root, 'node_modules', name);
		await mkdir(destination, { recursive: true });
		for (const entry of await readdir(source, { withFileTypes: true }))
			if (entry.isFile())
				await cp(path.join(source, entry.name), path.join(destination, entry.name));
		if (!name.startsWith('@exactjs/'))
			await cp(source, destination, { recursive: true, dereference: true });
		if (manifest.files?.includes('dist'))
			await cp(path.join(source, 'dist'), path.join(destination, 'dist'), { recursive: true });
		assert.ok((await realpath(destination)).startsWith(root + path.sep));
		for (const dependency of Object.keys(manifest.dependencies ?? {})) await copy(dependency);
	}
	for (const name of names) await copy(name);
}
