import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** Repository roots whose package manifests participate in publishing workflows. */
export const publishableWorkspaceRoots = Object.freeze([
	'agents',
	'packages',
	'framework-adapters',
	'react-adapters',
	'plugins',
	'component-libraries'
]);

const ignoredDirectories = new Set(['.git', '.tmp', 'dist', 'node_modules']);

/** Reads every package manifest maintained by this repository. */
export async function readWorkspaceManifests(root) {
	const manifests = [];
	for (const directory of [...publishableWorkspaceRoots, 'apps', 'fixtures']) {
		await visit(path.join(root, directory), directory, manifests);
	}
	return manifests.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

/** Returns whether a workspace is part of the public release set. */
export function isPublishableWorkspace(entry) {
	return (
		entry.manifest.private !== true &&
		entry.manifest.name?.startsWith('@exactjs/') === true &&
		publishableWorkspaceRoots.includes(entry.relativePath.split('/')[0])
	);
}

async function visit(directory, relativeDirectory, manifests) {
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (error?.code === 'ENOENT') return;
		throw error;
	}

	const packageEntry = entries.find((entry) => entry.isFile() && entry.name === 'package.json');
	if (packageEntry) {
		const filename = path.join(directory, packageEntry.name);
		manifests.push({
			filename,
			relativePath: `${relativeDirectory.replaceAll('\\', '/')}/package.json`,
			manifest: JSON.parse(await readFile(filename, 'utf8'))
		});
	}

	for (const entry of entries) {
		if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) continue;
		await visit(path.join(directory, entry.name), `${relativeDirectory}/${entry.name}`, manifests);
	}
}
