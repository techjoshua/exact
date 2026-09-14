import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isPublishableWorkspace, readWorkspaceManifests } from './workspace-manifests.mjs';

const root = path.resolve(import.meta.dirname, '..');
const expected = new Map(
	await Promise.all(
		['LICENSE', 'NOTICE'].map(async (name) => [name, await readFile(path.join(root, name), 'utf8')])
	)
);
const entries = await readWorkspaceManifests(root);
for (const entry of entries) {
	const { manifest } = entry;
	if (
		!isPublishableWorkspace(entry) &&
		!manifest.exactNativeTarget &&
		!['@exactjs/vscode', '@exactjs/chromium-devtools'].includes(manifest.name)
	)
		continue;
	if (
		manifest.license !== 'Apache-2.0' ||
		manifest.author !== 'Joshua Friesen' ||
		manifest.repository?.url !== 'git+https://github.com/techjoshua/exact.git'
	)
		throw new Error(`${entry.relativePath}: missing eXact license, author, or repository metadata`);
	for (const [name, contents] of expected) {
		if ((await readFile(path.join(path.dirname(entry.filename), name), 'utf8')) !== contents)
			throw new Error(`${entry.relativePath}: ${name} differs from the root notice`);
		if (manifest.files && !manifest.files.includes(name))
			throw new Error(`${entry.relativePath}: files must include ${name}`);
	}
}
console.log('Distribution license and copyright metadata match the repository.');
