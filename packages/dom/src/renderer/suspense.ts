import {
	type AnyComponentInstance,
	ReadinessContext,
	SuspensionContext,
	createReadinessCoordinator,
	normalizeRenderResult,
	trackComponentAsync,
	unwrap,
	type Child,
	type Component,
	type VNode
} from '@exactjs/core';
import { createComponentInstance } from '@exactjs/core/runtime/render';
import { createExactInternalOwnerArtifact } from '@exactjs/core/framework/component-contracts';
import { componentDomainInspection } from '@exactjs/core/framework/component-domains';
import { flushSync, withEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { placeMountedBefore } from '../placement.js';
import { mountDetachedChildren } from './mounting/children.js';
import { ownMountedInstance } from './root-lifecycle.js';
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
	const candidate = mountDetachedChildren(
		root,
		mounted.vnode.children,
		suspense.owner,
		mounted.scope,
		parentNode
	);
	if (suspense.coordinator.pending) {
		retainSuspenseTransition(mounted);
		suspense.candidate = {
			generation: suspense.coordinator.generation,
			children: candidate
		};
		mounted.children = mountFallback(
			root,
			mounted.vnode,
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
		createComponentInstance(
			ReadinessOwner,
			{ context: coordinator.context },
			parentInstance,
			undefined,
			mounted.vnode.domain ?? parentInstance?.domain
		)
	);
	owner.onUnmount(() => {
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
	updateSuspense(root, parent, mounted, mounted.vnode, suspense.parentInstance);
}

/** Starts a new candidate while retaining already revealed content until it is ready. */
export function updateSuspense(
	root: Root,
	parent: Node,
	mounted: Mounted,
	next: VNode,
	parentInstance: AnyComponentInstance | undefined
): void {
	const suspense = mounted.suspense;
	if (!suspense) throw new Error('Cannot update a Suspense boundary without readiness state');
	releaseSuspenseTransition(mounted);
	if (suspense.candidate) {
		unmountMany(suspense.candidate.children);
		suspense.candidate = undefined;
	}
	mounted.vnode = next;
	const generation = suspense.coordinator.beginGeneration();
	const candidate = mountDetachedChildren(
		root,
		next.children,
		suspense.owner,
		mounted.scope,
		parent
	);
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
	vnode: VNode,
	parentInstance: AnyComponentInstance | undefined,
	scope: EffectScope,
	parentNode: Node | undefined
): Mounted[] {
	return mountDetachedChildren(
		root,
		normalizeRenderResult(unwrap(vnode.props.fallback) as Child | Child[]),
		parentInstance,
		scope,
		parentNode
	);
}

function retainSuspenseTransition(mounted: Mounted): void {
	const suspense = mounted.suspense;
	if (!suspense || suspense.releaseTransition) return;
	const transition = mounted.vnode.props.__exactTransition as
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

const ReadinessOwner = createExactInternalOwnerArtifact(
	function ReadinessOwner(
		this: Component<Record<string, never>>,
		props: { context: ReturnType<typeof createReadinessCoordinator>['context'] }
	) {
		const owner = this as AnyComponentInstance;
		owner.contexts.set(ReadinessContext.id, props.context);
		owner.contexts.set(SuspensionContext.id, {
			suspend: (settlement: PromiseLike<unknown>) => {
				trackComponentAsync(owner, settlement);
				props.context.register({
					owner,
					taskGeneration: 0,
					settlement,
					retry: true
				});
			}
		});
		return () => null;
	},
	'@exactjs/dom:SuspenseReadinessOwner',
	'client'
);
