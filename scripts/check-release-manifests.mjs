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
const localProtocol = /^(?:file|link|workspace):/;
const root = path.resolve(import.meta.dirname, '..');
const entries = await readWorkspaceManifests(root);
const publishable = entries.filter(isPublishableWorkspace);
const byName = new Map(publishable.map((entry) => [entry.manifest.name, entry]));
const versions = new Set(publishable.map((entry) => entry.manifest.version));
const failures = [];

if (versions.size !== 1) {
	failures.push(
		`public package versions are not synchronized: ${[...versions].sort().join(', ')}`
	);
}

const [releaseVersion] = versions;
if (!releaseVersion || releaseVersion === '0.0.0') {
	failures.push('public packages must have a non-placeholder release version');
}

for (const entry of publishable) {
	const { manifest, relativePath } = entry;
	if (manifest.publishConfig?.access !== 'public') {
		failures.push(`${relativePath} must set publishConfig.access to "public"`);
	}

	for (const section of dependencySections) {
		const dependencies = manifest[section];
		if (!dependencies) continue;
		for (const [name, specification] of Object.entries(dependencies)) {
			if (typeof specification !== 'string') continue;
			if (localProtocol.test(specification)) {
				failures.push(
					`${relativePath} ${section}.${name} uses non-publishable local specification ${specification}`
				);
				continue;
			}
			const target = byName.get(name);
			if (!target) continue;
			const expected = `^${target.manifest.version}`;
			if (specification !== expected) {
				failures.push(
					`${relativePath} ${section}.${name} is ${specification}; expected ${expected}`
				);
			}
		}
	}
}

if (failures.length) {
	console.error('Release manifest validation failed:');
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}

console.log(
	`${publishable.length} public package manifests are synchronized at ${releaseVersion} with registry-safe internal ranges.`
);
