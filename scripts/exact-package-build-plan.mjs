import { isPublishableWorkspace, readWorkspaceManifests } from './workspace-manifests.mjs';

/** Returns publishable packages whose manifests request target-local eXact compilation. */
export async function exactCompileWorkspaces(repositoryRoot) {
	const manifests = await readWorkspaceManifests(repositoryRoot);
	return orderExactCompileWorkspaces(
		manifests.filter(
			(entry) =>
				isPublishableWorkspace(entry) &&
				(entry.manifest.exactCompileModules !== undefined ||
					entry.manifest.exactCompiledComponents !== undefined)
		)
	);
}

/** Orders target-local compilation after every compiled workspace dependency it can import. */
export function orderExactCompileWorkspaces(workspaces) {
	const byName = new Map(workspaces.map((workspace) => [workspace.manifest.name, workspace]));
	const remainingDependencies = new Map();
	const dependents = new Map();

	for (const workspace of workspaces) {
		const dependencies = [
			...new Set(workspaceDependencyNames(workspace.manifest).filter((name) => byName.has(name)))
		];
		remainingDependencies.set(workspace.manifest.name, new Set(dependencies));
		for (const dependency of dependencies) {
			const consumers = dependents.get(dependency) ?? [];
			consumers.push(workspace.manifest.name);
			dependents.set(dependency, consumers);
		}
	}

	const ready = workspaces
		.filter((workspace) => remainingDependencies.get(workspace.manifest.name)?.size === 0)
		.map((workspace) => workspace.manifest.name);
	const ordered = [];
	for (let index = 0; index < ready.length; index += 1) {
		const name = ready[index];
		ordered.push(byName.get(name));
		for (const dependent of dependents.get(name) ?? []) {
			const dependencies = remainingDependencies.get(dependent);
			dependencies.delete(name);
			if (dependencies.size === 0) ready.push(dependent);
		}
	}

	if (ordered.length !== workspaces.length) {
		const blocked = workspaces
			.map((workspace) => workspace.manifest.name)
			.filter((name) => remainingDependencies.get(name)?.size !== 0);
		throw new Error(`Cyclic eXact package compilation dependencies: ${blocked.join(', ')}`);
	}
	return ordered;
}

/** Returns package edges that can affect the emitted production module graph. */
function workspaceDependencyNames(manifest) {
	return [
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.optionalDependencies ?? {}),
		...Object.keys(manifest.peerDependencies ?? {})
	];
}
