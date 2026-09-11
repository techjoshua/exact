import { isPublishableWorkspace } from './workspace-manifests.mjs';

/**
 * Selects public npm workspaces by exact package name. An omitted list selects the initial
 * full release; private apps and native source templates cannot be selected for npm packing.
 */
export function selectReleaseWorkspaces(entries, names) {
	const available = entries.filter(isPublishableWorkspace);
	if (names === undefined) return available;
	const selected = new Set(names);
	if (!selected.size) throw new Error('The package selection must not be empty.');
	for (const name of selected) {
		if (!available.some((entry) => entry.manifest.name === name))
			throw new Error(`Not a public npm workspace: ${name}`);
	}
	return available.filter((entry) => selected.has(entry.manifest.name));
}
