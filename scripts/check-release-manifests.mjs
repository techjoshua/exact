import path from 'node:path';
import process from 'node:process';
import { existsSync, readFileSync } from 'node:fs';
import { isPublishableWorkspace, readWorkspaceManifests } from './workspace-manifests.mjs';

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
	failures.push(`public package versions are not synchronized: ${[...versions].sort().join(', ')}`);
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

	if (relativePath.startsWith('component-libraries/')) {
		if (manifest.dependencies?.['@exactjs/component-library'] !== '^0.1.0')
			failures.push(
				`${relativePath} must declare @exactjs/component-library in production dependencies`
			);
		if (
			manifest.exactComponentLibrary?.protocol !== 1 ||
			typeof manifest.exactComponentLibrary?.build !== 'string'
		)
			failures.push(`${relativePath} must declare protocol-1 exactComponentLibrary.build`);
		else {
			const buildFactsPath = path.resolve(
				path.dirname(entry.filename),
				manifest.exactComponentLibrary.build
			);
			if (!existsSync(buildFactsPath))
				failures.push(`${relativePath} is missing generated component build facts`);
			else {
				const facts = JSON.parse(readFileSync(buildFactsPath, 'utf8'));
				if (
					facts.protocol !== 1 ||
					facts.package?.name !== manifest.name ||
					facts.package?.version !== manifest.version ||
					!facts.exports?.length
				)
					failures.push(`${relativePath} has invalid or empty component build facts`);
			}
		}
	}
}

const marker = byName.get('@exactjs/component-library')?.manifest;
if (!marker || marker.exactComponentLibraryProtocol !== 1)
	failures.push('@exactjs/component-library must publish protocol marker 1');
else if (marker.main || marker.exports || marker.scripts)
	failures.push('@exactjs/component-library must remain inert with no executable entry or scripts');

if (failures.length) {
	console.error('Release manifest validation failed:');
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}

console.log(
	`${publishable.length} public package manifests are synchronized at ${releaseVersion} with registry-safe internal ranges.`
);
