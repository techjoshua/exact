import type { AnyContextToken, AnyComponentInstance } from '@exactjs/core';
import type { ExactComponentContinuationContract } from '@exactjs/core/framework/component-contracts';
import type { DomWorkBudget } from '@exactjs/dom/root';
import { createPatchBoundaryResolver } from '../patches.js';
import { mergeStatePublicationForContract } from '../state.js';
import { prepareStatePublication, type StatePublicationPlan } from '../state-publication.js';
import type { ExactInvocationResult } from '../types.js';
import type { ContinuationSubmission } from './array-submission.js';

/** Owned component task activation used for continuation transport and staged publication. */
export type ComponentInvocation = {
	instance: AnyComponentInstance;
	dependencies: readonly unknown[];
	contextWrites: readonly Readonly<{ name: string; token: AnyContextToken }>[];
	signal: AbortSignal;
	generation?: number;
};

/** Validates state, context and DOM authority and prepares state once before staged publication. */
export function prepareContinuationResponse(input: {
	container: Element;
	state: unknown;
	result: ExactInvocationResult;
	continuation: ExactComponentContinuationContract;
	submission: ContinuationSubmission;
	contextWrites?: readonly Readonly<{ name: string; token: AnyContextToken }>[];
	work: DomWorkBudget;
}): { result: ExactInvocationResult; plan?: StatePublicationPlan } | undefined {
	const { container, state, result, continuation, submission, contextWrites, work } = input;
	if (
		unauthorizedContinuationPatch(container, result.patches, continuation.boundaries, work) ||
		unauthorizedContinuationContexts(result.contexts, continuation.contextWrites, contextWrites)
	)
		return;
	let plan: StatePublicationPlan | undefined;
	try {
		if (state && typeof state === 'object')
			plan = prepareStatePublication(
				state as Record<string, unknown>,
				result,
				continuation.stateWrites,
				submission.members,
				submission.array
			);
	} catch {
		return;
	}
	if (state && typeof state === 'object')
		return { result: plan?.output ? { ...result, state: plan.output.state } : result, plan };
	const legacy = result.mutations?.filter((m) => m.operation !== 'array-net');
	const merged = mergeStatePublicationForContract(
		state,
		{ ...result, mutations: legacy?.length ? legacy : undefined },
		{ writes: continuation.stateWrites }
	);
	if (merged?.ok === false) return;
	return { result: merged?.ok ? { ...result, state: merged.state } : result, plan };
}

/** Rejects undeclared or unmapped component-context projections before client mutation. */
function unauthorizedContinuationContexts(
	contexts: Record<string, unknown> | undefined,
	allowed: readonly string[],
	mappings: readonly Readonly<{ name: string; token: AnyContextToken }>[] | undefined
): boolean {
	if (!contexts) return false;
	const allowedNames = new Set(allowed);
	const mappedNames = new Set((mappings ?? []).map((mapping) => mapping.name));
	return Object.keys(contexts).some((name) => !allowedNames.has(name) || !mappedNames.has(name));
}

/** Returns the first patch outside every compiler-declared affected boundary. */
function unauthorizedContinuationPatch(
	container: Element,
	patches: readonly import('@exactjs/core/framework/operation-protocol').ExactPatch[] | undefined,
	boundaries: readonly string[],
	work: DomWorkBudget
): import('@exactjs/core/framework/operation-protocol').ExactPatch | undefined {
	if (!patches?.length) return undefined;
	if (!boundaries.length) return patches[0];
	const boundaryForPatch = createPatchBoundaryResolver(container, boundaries, work);
	return patches.find((patch) => boundaryForPatch(patch.id) === undefined);
}
