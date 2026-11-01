import type { ExactLanguageService, ExactLanguageServiceOptions } from '@exactjs/compiler';
import { loadExactPackageEnhancements } from '@exactjs/config/node';
import type { ExactLanguageExtensionHost } from '@exactjs/language-extension-host';
import type { WorkspaceRoute } from './routing.js';
import type { WorkspaceState } from './state.js';

/** Constructs fresh project-owned sessions without relabeling or transferring stale overlays. */
export function createWorkspaceProject(
	route: WorkspaceRoute,
	createService: (options: ExactLanguageServiceOptions) => ExactLanguageService,
	createHost: (root: string) => Promise<ExactLanguageExtensionHost>
): WorkspaceState {
	const packageEnhancements = loadExactPackageEnhancements({
		applicationRoot: route.root
	}).packageEnhancements;
	return {
		...route,
		documents: new Map(),
		packageEnhancements,
		service: createService({
			root: route.root,
			noEmit: true,
			projectKind: route.workspaceRoot ? 'configured' : 'inferred',
			packageEnhancements
		}),
		languageHost: createHost(route.root)
	};
}

import { fileURLToPath } from 'node:url';
import { workspaceRoute } from './routing.js';
import { prepareWorkspaceInput, reserveUnavailableWorkspace } from './input-preparation.js';
import type { WorkspaceEntry } from './state.js';

/**
 * Admits input/query access to the selected project. Only an explicit edit may replace a failed
 * reservation without an event-wide snapshot batch. Its core input waits for the prior cleanup,
 * and no automatic reseeding of other open siblings is promised.
 */
export function lookupWorkspaceProject(
	roots: readonly string[],
	workspaces: Map<string, WorkspaceEntry>,
	uri: string,
	input: 'edit' | 'close' | undefined,
	createService: (options: ExactLanguageServiceOptions) => ExactLanguageService,
	createHost: (root: string) => Promise<ExactLanguageExtensionHost>
): WorkspaceState | undefined {
	const route = workspaceRoute(roots, fileURLToPath(uri));
	let workspace = workspaces.get(route.root);
	const unavailable = workspace && 'cleanup' in workspace ? workspace : undefined;
	if (unavailable && input !== 'edit') return undefined;
	if (!workspace || unavailable) {
		workspace = createWorkspaceProject(route, createService, createHost);
		workspaces.set(route.root, workspace);
	}
	if ('cleanup' in workspace) return undefined;
	if (unavailable) {
		const current = workspace;
		void prepareWorkspaceInput(
			current,
			async () => {
				await unavailable.cleanup;
				return undefined;
			},
			() => workspaces.get(current.root) === current,
			() => reserveUnavailableWorkspace(workspaces, current)
		).catch(() => undefined);
	}
	return workspace.preparation && !input ? undefined : workspace;
}
