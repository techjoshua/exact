import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { isPublishableWorkspace, readWorkspaceManifests } from './workspace-manifests.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const generator = path.join(import.meta.dirname, 'generate-component-library-build-facts.mjs');
const manifests = await readWorkspaceManifests(repositoryRoot);
const componentLibraries = manifests.filter(
	(entry) => isPublishableWorkspace(entry) && entry.manifest.exactComponentLibrary?.protocol === 1
);

if (!componentLibraries.length) throw new Error('No publishable eXact component libraries found');

for (const entry of componentLibraries) {
	execFileSync(process.execPath, [generator, path.dirname(entry.filename)], { stdio: 'inherit' });
}

console.log(`Generated build facts for ${componentLibraries.length} component libraries.`);
