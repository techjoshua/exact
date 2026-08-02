import {
	createErrorReport,
	handleComponentError,
	isTaskCancellation,
	type ComponentInstance,
	type StructuralReleaseReason,
	type VNode
} from '@exactjs/core';
import {
	componentRootReleaseObserved,
	publishComponentRootRelease,
	reverseComponentRootRelease,
	settleComponentRootRelease
} from '@exactjs/core/framework/component-roots';
import {
	captureTaskFrame,
	runTaskFrame,
	type TaskFrameExecution
} from '@exactjs/core/framework/task-frames';
import { flushSync } from '@exactjs/reactive';
import type { Mounted, Root } from '../types.js';
import { removeMountedNodes, unmountMounted } from './teardown.js';

type RetainedRelease = NonNullable<Root['releasing']> extends Set<infer Entry> ? Entry : never;
const pendingReleases = new WeakMap<Root, Set<Mounted>>();

/** Retains a structurally absent range until root-release task descendants settle. */
export function releaseMountedRange(
	root: Root,
	parent: Node,
	mounted: Mounted,
	reason: StructuralReleaseReason
): boolean {
	if (pendingReleases.get(root)?.has(mounted)) return true;
	for (const retained of root.releasing ?? []) {
		if (retained.parent === parent && retained.mounted === mounted && !retained.finalized)
			return true;
	}
	const instances = observedRootInstances(mounted);
	if (!instances.length) return false;
	let pending = pendingReleases.get(root);
	if (!pending) pendingReleases.set(root, (pending = new Set()));
	pending.add(mounted);
	const parentFrame = captureTaskFrame();
	const generations = new Map<ComponentInstance<any>, number>();
	let execution: TaskFrameExecution<void>;
	try {
		execution = runTaskFrame<void>(
			{
				...(parentFrame ? { parent: parentFrame } : {}),
				kind: 'root-release',
				label: reason,
				priority: 'immediate',
				readiness: 'nonblocking'
			},
			{
				work() {
					for (const instance of instances) {
						const release = publishComponentRootRelease(instance, reason);
						if (release) generations.set(instance, release.generation);
					}
					// Release-dependent tasks are ordinary reactive consumers. Flush while
					// this frame is active so their consequence work attaches structurally.
					flushSync();
				}
			}
		);
	} finally {
		pending.delete(mounted);
		if (!pending.size) pendingReleases.delete(root);
	}
	if (!generations.size) {
		execution.cancel('root-release-unobserved');
		void execution.catch(() => undefined);
		return false;
	}
	const retained: RetainedRelease = {
		parent,
		mounted,
		execution,
		generations,
		finalized: false
	};
	(root.releasing ??= new Set()).add(retained);
	void execution.then(
		() => finalizeRetainedRelease(root, retained),
		(error) => {
			finalizeRetainedRelease(root, retained);
			if (!isTaskCancellation(error)) reportReleaseFailure(root, instances[0], error);
		}
	);
	return true;
}

/** Restores a retained range when reconciliation requests the same identity and generation. */
export function takeReversedRelease(root: Root, parent: Node, next: VNode): Mounted | undefined {
	for (const retained of root.releasing ?? []) {
		if (
			retained.parent !== parent ||
			retained.mounted.vnode.type !== next.type ||
			retained.mounted.vnode.key !== next.key ||
			retained.mounted.vnode.domain !== next.domain
		)
			continue;
		retained.execution.cancel('release-reversed');
		root.releasing?.delete(retained);
		retained.finalized = true;
		for (const [instance, generation] of retained.generations)
			reverseComponentRootRelease(instance, generation);
		return retained.mounted;
	}
	return undefined;
}

/** Cancels and synchronously disposes every retained release during root shutdown. */
export function disposeRetainedReleases(root: Root): void {
	for (const retained of [...(root.releasing ?? [])]) {
		retained.execution.cancel('owner-disposed');
		finalizeRetainedRelease(root, retained);
	}
}

/** Completes physical disposal exactly once after structural release settlement. */
function finalizeRetainedRelease(root: Root, retained: RetainedRelease): void {
	if (retained.finalized) return;
	retained.finalized = true;
	root.releasing?.delete(retained);
	for (const [instance, generation] of retained.generations)
		settleComponentRootRelease(instance, generation);
	unmountMounted(retained.mounted);
	removeMountedNodes(retained.parent, retained.mounted);
}

/** Finds observed component roots without allocating lifecycle state for unrelated components. */
function observedRootInstances(mounted: Mounted): ComponentInstance<any>[] {
	const result: ComponentInstance<any>[] = [];
	const pending = [mounted];
	while (pending.length) {
		const current = pending.pop()!;
		if (current.instance && componentRootReleaseObserved(current.instance))
			result.push(current.instance);
		for (const child of current.children) pending.push(child);
		for (const child of current.suspense?.candidate?.children ?? []) pending.push(child);
	}
	return result;
}

/** Routes operational release failures through the existing component/root error contract. */
function reportReleaseFailure(
	root: Root,
	owner: ComponentInstance<any> | undefined,
	error: unknown
): void {
	if (owner) {
		handleComponentError(owner, createErrorReport(error, 'dom', owner, 'root-release'));
		return;
	}
	root.errors.report(error, { source: 'dom', phase: 'root-release' });
}
