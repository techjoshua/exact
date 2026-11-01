import { findExactConfig } from '@exactjs/config/node';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkspaceInput, WorkspaceEntry } from './state.js';

/** Construction context selected by the existing bounded nearest-config policy. */
export type WorkspaceRoute = Readonly<{ root: string; workspaceRoot?: string }>;

/** Resolves a route without creating or mutating a session. Config contents are not reloaded here. */
export function workspaceRoute(roots: readonly string[], filename: string): WorkspaceRoute {
	const workspaceRoot = roots.find(
		(candidate) => filename === candidate || filename.startsWith(`${candidate}${path.sep}`)
	);
	const configPath = findExactConfig(path.dirname(filename), workspaceRoot);
	return {
		root: configPath ? path.dirname(configPath) : (workspaceRoot ?? path.dirname(filename)),
		...(workspaceRoot ? { workspaceRoot } : {})
	};
}

/** Exact creation context, not a mutable project-kind label or a document authority. */
export function sameWorkspaceRoute(left: WorkspaceRoute, right: WorkspaceRoute): boolean {
	return left.root === right.root && left.workspaceRoot === right.workspaceRoot;
}

/**
 * Plans affected source/destination projects at folder-event time. Discovery scans roots and config
 * ancestors per input/accepted overlay, never per query. Cached empty incompatible records retire too.
 */
export function planWorkspaceFolders(
	roots: readonly string[],
	workspaces: ReadonlyMap<string, WorkspaceEntry>,
	change: Readonly<{ added: readonly string[]; removed: readonly string[] }>,
	inputs: readonly WorkspaceInput[]
) {
	const removed = new Set(change.removed.map((root) => path.resolve(root)));
	const nextRoots = [...new Set([...roots, ...change.added.map((root) => path.resolve(root))])]
		.filter((root) => !removed.has(root))
		.sort((a, b) => b.length - a.length);
	const affected = new Set<string>();
	for (const workspace of workspaces.values()) {
		if ('cleanup' in workspace) {
			affected.add(workspace.root);
			continue;
		}
		const context = workspaceRoute(
			nextRoots,
			path.join(workspace.root, '__exact_project_context__.tsx')
		);
		if (!sameWorkspaceRoute(workspace, context)) {
			affected.add(workspace.root);
			affected.add(context.root);
		}
		for (const filename of workspace.documents.keys()) {
			const next = workspaceRoute(nextRoots, filename);
			if (!sameWorkspaceRoute(workspace, next)) {
				affected.add(workspace.root);
				affected.add(next.root);
			}
		}
	}
	const routes = new Map<WorkspaceInput, WorkspaceRoute>();
	for (const input of inputs) {
		if (!input.uri.startsWith('file:')) continue;
		const filename = path.resolve(fileURLToPath(input.uri));
		const route = workspaceRoute(nextRoots, filename);
		routes.set(input, route);
		const current = workspaces.get(route.root);
		if (
			!current ||
			'cleanup' in current ||
			!sameWorkspaceRoute(current, route) ||
			current.documents.get(filename)?.version !== input.version
		)
			affected.add(route.root);
	}
	return { roots: nextRoots, affected, routes };
}
