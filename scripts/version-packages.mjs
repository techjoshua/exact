import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
	isPublishableWorkspace,
	readWorkspaceManifests
} from './workspace-manifests.mjs';

const dependencySections = Object.freeze([
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies'
]);
const version = argument('version') ?? process.argv[2];

if (!version || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
	throw new Error(
		'Provide a release version, for example: npm run version:packages -- --version=0.1.0'
	);
}

const root = path.resolve(import.meta.dirname, '..');
const entries = await readWorkspaceManifests(root);
const publishable = entries.filter(isPublishableWorkspace);
const publishedNames = new Set(publishable.map((entry) => entry.manifest.name));
let dependencyUpdates = 0;
let changedManifests = 0;

for (const entry of entries) {
	const manifest = entry.manifest;
	let changed = false;

	if (isPublishableWorkspace(entry)) {
		if (manifest.version !== version) {
			manifest.version = version;
			changed = true;
		}
		if (manifest.publishConfig?.access !== 'public') {
			manifest.publishConfig = { ...manifest.publishConfig, access: 'public' };
			changed = true;
		}
	}

	for (const section of dependencySections) {
		const dependencies = manifest[section];
		if (!dependencies) continue;
		for (const name of Object.keys(dependencies)) {
			if (!publishedNames.has(name)) continue;
			const expected = `^${version}`;
			if (dependencies[name] === expected) continue;
			dependencies[name] = expected;
			dependencyUpdates++;
			changed = true;
		}
	}

	if (!changed) continue;
	await writeFile(entry.filename, `${JSON.stringify(manifest, null, '\t')}\n`);
	changedManifests++;
}

console.log(
	`Set ${publishable.length} public packages to ${version}; updated ${dependencyUpdates} internal dependency ranges across ${changedManifests} manifests.`
);
console.log('Run npm install --package-lock-only --ignore-scripts to refresh package-lock.json.');

function argument(name) {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
