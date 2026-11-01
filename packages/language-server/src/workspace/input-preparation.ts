import type { ExactLanguageServiceUpdate } from '@exactjs/compiler';
import type { WorkspaceState, WorkspaceEntry } from './state.js';

/** Settles every resource before propagating the first rejection, including undefined or zero. */
export async function settleWorkspaceWork<T>(work: readonly Promise<T>[]): Promise<T[]> {
	const outcomes = await Promise.allSettled(work);
	const values: T[] = [];
	let failed = false,
		primary: unknown;
	for (const result of outcomes) {
		if (result.status === 'fulfilled') values.push(result.value);
		else if (!failed) {
			failed = true;
			primary = result.reason;
		}
	}
	if (failed) throw primary;
	return values;
}

/** Retired records have a single caller owning all service and late host releases. */
export async function disposeWorkspaces(workspaces: readonly WorkspaceEntry[]): Promise<void> {
	await settleWorkspaceWork(
		workspaces.map((workspace) =>
			'cleanup' in workspace
				? workspace.cleanup
				: settleWorkspaceWork([
						Promise.resolve().then(() => workspace.service.dispose()),
						workspace.languageHost.then((host) => host.dispose())
					]).then(() => undefined)
		)
	);
}

/**
 * Orders core seed/edit/close mutation only during an affected project's preparation interval.
 * The promise is installed before dispatch. Failed current projects retire before cleanup, and
 * cleanup failure never replaces the core primary. Provider work is deliberately outside the tail.
 */
export function prepareWorkspaceInput(
	workspace: WorkspaceState,
	apply: () => Promise<ExactLanguageServiceUpdate | undefined>,
	isCurrent: () => boolean,
	retire: () => Promise<void>
): Promise<ExactLanguageServiceUpdate | undefined> {
	const previous = workspace.preparation;
	let update: ExactLanguageServiceUpdate | undefined;
	const preparation = Promise.resolve()
		.then(async () => {
			await previous;
			if (!isCurrent()) return;
			update = await apply();
		})
		.catch(async (error) => {
			// Retirement owns cleanup once. A stale tail cannot retire a replacement record.
			try {
				await retire();
			} catch {
				/* The original core failure remains primary. */
			}
			throw error;
		});
	workspace.preparation = preparation;
	void preparation.then(
		() => {
			if (workspace.preparation === preparation) delete workspace.preparation;
		},
		() => {
			if (workspace.preparation === preparation) delete workspace.preparation;
		}
	);
	return preparation.then(() => update);
}

/** Drains edits/closes admitted during seeding, without waiting on provider diagnostics. */
export async function finishWorkspacePreparation(workspace: WorkspaceState): Promise<void> {
	while (workspace.preparation) await workspace.preparation;
}

/**
 * Revokes exactly this failed record before resource cleanup can reenter. The same map slot keeps
 * the already-claimed cleanup completion unavailable until explicit input/reconciliation replaces it.
 */
export async function reserveUnavailableWorkspace(
	workspaces: Map<string, WorkspaceEntry>,
	workspace: WorkspaceState
): Promise<void> {
	if (workspaces.get(workspace.root) !== workspace) return;
	const cleanup = disposeWorkspaces([workspace]);
	workspaces.set(workspace.root, {
		root: workspace.root,
		...(workspace.workspaceRoot ? { workspaceRoot: workspace.workspaceRoot } : {}),
		cleanup
	});
	void cleanup.catch(() => undefined);
	await cleanup;
}
