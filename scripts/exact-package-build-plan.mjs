import { isPublishableWorkspace, readWorkspaceManifests } from './workspace-manifests.mjs';

/** Returns publishable packages whose manifests request target-local eXact compilation. */
export async function exactCompileWorkspaces(repositoryRoot) {
	const manifests = await readWorkspaceManifests(repositoryRoot);
	return manifests.filter(
		(entry) =>
			isPublishableWorkspace(entry) &&
			(entry.manifest.exactCompileModules !== undefined ||
				entry.manifest.exactCompiledComponents !== undefined)
	);
}
