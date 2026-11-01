import type { ExactLanguageServiceUpdate } from '@exactjs/compiler';
import { fileURLToPath } from 'node:url';
import type { ExactDocumentSynchronization } from '../workspace-manager.js';
import {
	disposeWorkspaces,
	finishWorkspacePreparation,
	prepareWorkspaceInput
} from './input-preparation.js';
import { planWorkspaceFolders, type WorkspaceRoute } from './routing.js';
import type {
	DocumentState,
	WorkspaceInput,
	WorkspaceState,
	WorkspaceEntry,
	UnavailableWorkspace
} from './state.js';

/** Current results and exact per-operation failures after all transaction-owned work settles. */
export type WorkspaceFolderOutcome = Readonly<{
	results: readonly Readonly<{
		input: WorkspaceInput;
		synchronization: ExactDocumentSynchronization;
	}>[];
	errors: readonly unknown[];
}>;

/** Existing manager authority and resource operations, with no independent request state. */
type FolderOwner = Readonly<{
	create(route: WorkspaceRoute): WorkspaceState;
	owns(workspace: WorkspaceState): boolean;
	retire(workspace: WorkspaceState): Promise<void>;
	finalize(
		workspace: WorkspaceState,
		filename: string,
		document: DocumentState,
		update: ExactLanguageServiceUpdate
	): Promise<ExactDocumentSynchronization | undefined>;
}>;

type SeedInput = {
	input: WorkspaceInput;
	filename: string;
	document: DocumentState;
	source: string;
};
/** Keeps private result ownership through the final cleanup await, never exposing it as a token. */
type OwnedResult = SeedInput & {
	workspace: WorkspaceState;
	synchronization: ExactDocumentSynchronization;
};
type DestinationOutcome = { results: OwnedResult[]; errors: unknown[] };

/**
 * Claims retired cleanup and unavailable destinations before invoking any project factory.
 * Each returned project has its seed/preparation installed before exposure or the next factory.
 * Successful current results survive independent setup/core/finalization/cleanup failures.
 * Input references provide correspondence only. Setup/core/finalization errors precede cleanup
 * errors in stable destination/input order, with each cleanup owner preserving its first primary.
 */
export function reconcileWorkspaceFolders(
	roots: string[],
	workspaces: Map<string, WorkspaceEntry>,
	change: Readonly<{ added: readonly string[]; removed: readonly string[] }>,
	inputs: readonly WorkspaceInput[],
	owner: FolderOwner
) {
	const plan = planWorkspaceFolders(roots, workspaces, change, inputs);
	const affectedInputs = inputs.filter((input) => {
		const route = plan.routes.get(input);
		return route && plan.affected.has(route.root);
	});
	const destinations = new Map<
		string,
		{ route: WorkspaceRoute; inputs: SeedInput[]; reservation: UnavailableWorkspace }
	>();
	for (const input of affectedInputs) {
		const route = plan.routes.get(input)!;
		let destination = destinations.get(route.root);
		if (!destination) {
			destination = { route, inputs: [], reservation: { ...route, cleanup: Promise.resolve() } };
			destinations.set(route.root, destination);
		}
		destination.inputs.push({
			input,
			filename: fileURLToPath(input.uri),
			document: { version: input.version },
			source: input.source
		});
	}
	roots.splice(0, roots.length, ...plan.roots);
	const cleanups: Promise<void>[] = [];
	const claimCleanup = (cleanup: Promise<void>) => {
		cleanups.push(cleanup);
		void cleanup.catch(() => undefined);
		return cleanup;
	};
	for (const root of plan.affected) {
		const current = workspaces.get(root);
		if (current) {
			workspaces.delete(root);
			void claimCleanup(Promise.resolve().then(() => disposeWorkspaces([current])));
		}
	}
	for (const { route, reservation } of destinations.values())
		workspaces.set(route.root, reservation);
	const work: Promise<DestinationOutcome>[] = [];
	for (const { route, inputs: seedInputs, reservation } of destinations.values()) {
		if (workspaces.get(route.root) !== reservation) continue;
		try {
			const workspace = owner.create(route);
			// A factory may synchronously reconcile/remove/dispose. Its returned resource is still ours
			// until this exact reservation transfers ownership, never a nested replacement's resource.
			if (workspaces.get(route.root) !== reservation) {
				void claimCleanup(Promise.resolve().then(() => disposeWorkspaces([workspace])));
				continue;
			}
			for (const seed of seedInputs) workspace.documents.set(seed.filename, seed.document);
			work.push(prepareDestination(workspace, seedInputs, owner, claimCleanup));
			workspaces.set(route.root, workspace);
		} catch (error) {
			work.push(Promise.resolve({ results: [], errors: [error] }));
		}
	}
	const completion = finishReconciliation(work, cleanups, owner);
	return { affectedInputs, completion };
}

/** Core failure reserves the project, while one failed final inspection leaves other results intact. */
async function prepareDestination(
	workspace: WorkspaceState,
	inputs: SeedInput[],
	owner: FolderOwner,
	claimCleanup: (cleanup: Promise<void>) => Promise<void>
): Promise<DestinationOutcome> {
	const seed = prepareWorkspaceInput(
		workspace,
		() =>
			workspace.service.synchronize(
				inputs.map(({ filename, document, source }) => ({
					kind: 'upsert',
					filename,
					version: document.version,
					source
				}))
			),
		() => owner.owns(workspace),
		() => claimCleanup(owner.retire(workspace))
	);
	try {
		const update = await seed;
		await finishWorkspacePreparation(workspace);
		if (!update || !owner.owns(workspace)) return { results: [], errors: [] };
		const outcomes = await Promise.allSettled(
			inputs.map(async (input) => {
				const synchronization = await owner.finalize(
					workspace,
					input.filename,
					input.document,
					update
				);
				return synchronization ? { ...input, workspace, synchronization } : undefined;
			})
		);
		const results: OwnedResult[] = [],
			errors: unknown[] = [];
		for (const outcome of outcomes) {
			if (outcome.status === 'rejected') errors.push(outcome.reason);
			else if (outcome.value) results.push(outcome.value);
		}
		return { results, errors };
	} catch (error) {
		return { results: [], errors: [error] };
	}
}

/** Settles every owned task, retaining exact primitives and checking result authority after cleanup. */
async function finishReconciliation(
	work: Promise<DestinationOutcome>[],
	cleanups: Promise<void>[],
	owner: FolderOwner
): Promise<WorkspaceFolderOutcome> {
	const outcomes = await Promise.allSettled(work);
	const results: OwnedResult[] = [],
		errors: unknown[] = [];
	for (const outcome of outcomes) {
		if (outcome.status === 'rejected') errors.push(outcome.reason);
		else {
			results.push(...outcome.value.results);
			errors.push(...outcome.value.errors);
		}
	}
	for (const cleanup of await Promise.allSettled(cleanups)) {
		if (cleanup.status === 'rejected') errors.push(cleanup.reason);
	}
	return {
		results: results
			.filter(
				(result) =>
					owner.owns(result.workspace) &&
					!result.workspace.preparation &&
					result.workspace.documents.get(result.filename) === result.document
			)
			.map(({ input, synchronization }) => ({ input, synchronization })),
		errors
	};
}
