import {
	type AnyComponentInstance,
	ReadinessContext,
	SuspensionContext,
	createReadinessCoordinator,
	normalizeRenderResult,
	trackComponentAsync,
	unwrap,
	type Child
} from '@exactjs/core';
import { createFrameworkLogicalOwner } from '@exactjs/core/runtime/render-operations';
import { componentDomainInspection } from '@exactjs/core/framework/component-domains';
import { registerComponentLifecycleHandler } from '@exactjs/core/framework/component-lifecycle';
import { flushSync, withEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { placeMountedBefore } from '../placement.js';
import { mountDetachedChildren } from './mounting/children.js';
import { ownMountedInstance } from './component-mount-ownership.js';
import { disposeMounted, unmountMany } from './teardown.js';

/** Constructs the candidate and presentation state for a native Suspense mount. */
export function initializeSuspense(
	root: Root,
	mounted: Mounted,
	parentInstance: AnyComponentInstance | undefined,
	parentNode: Node | undefined
): void {
	prepareSuspense(root, mounted, parentInstance);
	const suspense = mounted.suspense!;
	const candidate = mountSuspenseCandidate(root, mounted, suspenseInput(mounted), parentNode);
	if (suspense.coordinator.pending) {
		retainSuspenseTransition(mounted);
		suspense.candidate = {
			generation: suspense.coordinator.generation,
			children: candidate
		};
		mounted.children = mountFallback(
			root,
			suspenseInput(mounted),
			parentInstance,
			mounted.scope,
			parentNode
		);
	} else {
		mounted.children = candidate;
		suspense.revealed = true;
	}
	publishSuspenseChange(mounted);
	suspense.owner.markMounted();
}

/** Creates the generation coordinator and logical context owner for a Suspense boundary. */
export function prepareSuspense(
	root: Root,
	mounted: Mounted,
	parentInstance: AnyComponentInstance | undefined
): void {
	let queuedGeneration: number | undefined;
	const coordinator = createReadinessCoordinator((pending, generation, retry) => {
		publishSuspenseChange(mounted);
		if (pending) {
			retainSuspenseTransition(mounted);
			return;
		}
		if (queuedGeneration === generation) return;
		queuedGeneration = generation;
		queueMicrotask(() => {
			if (queuedGeneration !== generation) return;
			queuedGeneration = undefined;
			if (retry) retrySuspenseCandidate(root, mounted, generation);
			else if (mounted.suspense?.candidate) commitSuspenseCandidate(root, mounted, generation);
			else {
				// A blocking task can restart inside already committed content without
				// reconstructing the boundary. Publish its staged response only after every
				// registration in this readiness generation has settled.
				mounted.suspense?.coordinator.commitGeneration();
				flushSync();
				releaseSuspenseTransition(mounted);
			}
		});
	});
	coordinator.beginGeneration();
	const owner = withEffectScope(mounted.scope, () =>
		createFrameworkLogicalOwner(
			parentInstance,
			parentInstance?.ambientContexts ?? root.ambientContexts,
			suspenseInput(mounted).domain ?? parentInstance?.domain ?? root.domain!,
			(owner) => {
				owner.contexts.set(ReadinessContext.id, coordinator.context);
				owner.contexts.set(SuspensionContext.id, {
					suspend: (settlement: PromiseLike<unknown>) => {
						trackComponentAsync(owner, settlement);
						return coordinator.context.register({
							owner,
							taskGeneration: 0,
							settlement,
							retry: true
						});
					}
				});
			}
		)
	);
	registerComponentLifecycleHandler(owner, 'unmount', () => {
		releaseSuspenseTransition(mounted);
		coordinator.dispose();
	});
	ownMountedInstance(mounted, owner);
	mounted.suspense = { coordinator, owner, parentInstance, revealed: false };
}

/** Commits a prepared hydration candidate after its server fallback is adopted. */
export function commitPreparedSuspense(root: Root, mounted: Mounted): void {
	const generation = mounted.suspense?.candidate?.generation;
	if (generation !== undefined) commitSuspenseCandidate(root, mounted, generation);
}

function retrySuspenseCandidate(root: Root, mounted: Mounted, generation: number): void {
	const suspense = mounted.suspense;
	if (!suspense?.candidate || suspense.candidate.generation !== generation) return;
	const parent = mounted.dom.parentNode;
	if (!parent) {
		mounted.afterPlacement = () => retrySuspenseCandidate(root, mounted, generation);
		return;
	}
	updateSuspense(root, parent, mounted, suspenseInput(mounted), suspense.parentInstance);
}

/** Starts a new candidate while retaining already revealed content until it is ready. */
export function updateSuspense(
	root: Root,
	parent: Node,
	mounted: Mounted,
	next: SuspenseBoundaryInput,
	parentInstance: AnyComponentInstance | undefined
): void {
	const suspense = mounted.suspense;
	if (!suspense) throw new Error('Cannot update a Suspense boundary without readiness state');
	releaseSuspenseTransition(mounted);
	if (suspense.candidate) {
		unmountMany(suspense.candidate.children);
		suspense.candidate = undefined;
	}
	mounted.suspenseReceipt = next;
	const generation = suspense.coordinator.beginGeneration();
	const candidate = mountSuspenseCandidate(root, mounted, next, parent);
	if (suspense.coordinator.pending) {
		retainSuspenseTransition(mounted);
		suspense.candidate = { generation, children: candidate };
		if (!suspense.revealed || unwrap(next.props.presentation) === 'replace') {
			for (const child of mounted.children) disposeMounted(parent, child);
			mounted.children = mountFallback(root, next, parentInstance, mounted.scope, parent);
			for (const child of mounted.children) placeMountedBefore(root, parent, child, mounted.end);
			suspense.revealed = false;
		}
		publishSuspenseChange(mounted);
		return;
	}
	replacePresentedChildren(root, parent, mounted, candidate);
	suspense.revealed = true;
	publishSuspenseChange(mounted);
}

function commitSuspenseCandidate(root: Root, mounted: Mounted, generation: number): void {
	const suspense = mounted.suspense;
	const candidate = suspense?.candidate;
	if (!suspense || !candidate || candidate.generation !== generation) return;
	const parent = mounted.dom.parentNode;
	if (!parent || mounted.end?.parentNode !== parent) {
		mounted.afterPlacement = () => commitSuspenseCandidate(root, mounted, generation);
		return;
	}
	suspense.coordinator.commitGeneration();
	flushSync();
	suspense.candidate = undefined;
	replacePresentedChildren(root, parent, mounted, candidate.children);
	suspense.revealed = true;
	releaseSuspenseTransition(mounted);
	publishSuspenseChange(mounted);
}

function publishSuspenseChange(mounted: Mounted): void {
	const suspense = mounted.suspense;
	if (!suspense) return;
	componentDomainInspection(suspense.owner.domain)?.publish({
		kind: 'suspense.change',
		component: suspense.owner,
		attributes: Object.freeze({
			pending: suspense.coordinator.pending,
			generation: suspense.coordinator.generation,
			revealed: suspense.revealed,
			hasCandidate: !!suspense.candidate
		})
	});
}

function replacePresentedChildren(
	root: Root,
	parent: Node,
	mounted: Mounted,
	children: Mounted[]
): void {
	for (const child of children) placeMountedBefore(root, parent, child, mounted.end);
	for (const child of mounted.children) disposeMounted(parent, child);
	mounted.children = children;
}

function mountFallback(
	root: Root,
	boundary: SuspenseBoundaryInput,
	parentInstance: AnyComponentInstance | undefined,
	scope: EffectScope,
	parentNode: Node | undefined
): Mounted[] {
	return mountDetachedChildren(
		root,
		normalizeRenderResult(unwrap(boundary.props.fallback) as Child | Child[]),
		parentInstance,
		scope,
		parentNode
	);
}

/** Mounts a pending candidate into an owned fragment so reactive replacements remain patchable. */
function mountSuspenseCandidate(
	root: Root,
	mounted: Mounted,
	input: SuspenseBoundaryInput,
	_parentNode: Node | undefined
): Mounted[] {
	const fragment = document.createDocumentFragment();
	const children = mountDetachedChildren(
		root,
		[...input.children],
		mounted.suspense!.owner,
		mounted.scope,
		fragment
	);
	for (const child of children) placeMountedBefore(root, fragment, child, null);
	return children;
}

function retainSuspenseTransition(mounted: Mounted): void {
	const suspense = mounted.suspense;
	if (!suspense || suspense.releaseTransition) return;
	const transition = suspenseInput(mounted).props.__exactTransition as
		| { retain?: () => () => void }
		| undefined;
	if (typeof transition?.retain === 'function') suspense.releaseTransition = transition.retain();
}

function releaseSuspenseTransition(mounted: Mounted): void {
	const suspense = mounted.suspense;
	const release = suspense?.releaseTransition;
	if (!suspense || !release) return;
	suspense.releaseTransition = undefined;
	release();
}

type SuspenseBoundaryInput = Readonly<{
	props: Readonly<Record<string, unknown>>;
	children: readonly Child[];
	domain?: import('@exactjs/core').ComponentDomain;
}>;

/** Reads readiness-boundary inputs directly from a compiler-issued operation. */
function suspenseInput(mounted: Mounted): SuspenseBoundaryInput {
	const input = mounted.suspenseReceipt;
	if (!input) throw new Error('Mounted Suspense boundary has no readiness-boundary inputs');
	return input;
}
