import {
	type AnyComponentInstance,
	createErrorReport,
	handleComponentError,
	isTaskCancellation
} from '@exactjs/core';
import {
	componentRootReleaseObserved,
	publishComponentRootRelease,
	reverseComponentRootRelease,
	settleComponentRootRelease
} from '@exactjs/core/framework/component-roots';
import { isOpaqueOperation } from '@exactjs/core/runtime/component-operations';
import {
	captureTaskFrame,
	runTaskFrame,
	type TaskFrameExecution
} from '@exactjs/core/framework/task-frames';
import { flushSync } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { setMountedSubtreeActivity } from './component-roots.js';
import { foreignChildCapability } from './foreign-child-capability.js';
import { canPatchOpaqueOperation } from './patching/native-operation-target.js';
import {
	registerRetainedReleaseCapability,
	type RetainedReleaseCapability
} from './retained-release.js';
import { removeMountedNodes, unmountMounted } from './teardown.js';

type RetainedRelease = NonNullable<Root['releasing']> extends Set<infer Entry> ? Entry : never;
const pendingReleases = new WeakMap<Root, Set<Mounted>>();

const capability: RetainedReleaseCapability = Object.freeze({
	release(root, parent, mounted, reason) {
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
		const generations = new Map<AnyComponentInstance, number>();
		const activityToken = Symbol('structural-release');
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
						flushSync();
						setMountedSubtreeActivity(mounted, activityToken, false, reason);
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
			activityToken,
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
	},
	reverse(root, parent, next) {
		const native = isOpaqueOperation(next);
		for (const retained of root.releasing ?? []) {
			if (
				retained.parent !== parent ||
				!(
					(native && canPatchOpaqueOperation(retained.mounted, next)) ||
					foreignChildCapability()?.canPatch(retained.mounted, next) === true
				)
			)
				continue;
			retained.execution.cancel('release-reversed');
			root.releasing?.delete(retained);
			retained.finalized = true;
			for (const [instance, generation] of retained.generations)
				reverseComponentRootRelease(instance, generation);
			setMountedSubtreeActivity(retained.mounted, retained.activityToken, true, 'release-reversed');
			return retained.mounted;
		}
		return undefined;
	},
	dispose(root) {
		for (const retained of [...(root.releasing ?? [])]) {
			retained.execution.cancel('owner-disposed');
			finalizeRetainedRelease(root, retained);
		}
	}
});

/** Installs root-release retention only for components that select the root-ref capability. */
export function installRetainedReleaseIntegration(): void {
	registerRetainedReleaseCapability(capability);
}

function finalizeRetainedRelease(root: Root, retained: RetainedRelease): void {
	if (retained.finalized) return;
	retained.finalized = true;
	root.releasing?.delete(retained);
	for (const [instance, generation] of retained.generations)
		settleComponentRootRelease(instance, generation);
	unmountMounted(retained.mounted);
	removeMountedNodes(retained.parent, retained.mounted);
}

function observedRootInstances(mounted: Mounted): AnyComponentInstance[] {
	const result: AnyComponentInstance[] = [];
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

function reportReleaseFailure(
	root: Root,
	owner: AnyComponentInstance | undefined,
	error: unknown
): void {
	if (owner) {
		handleComponentError(owner, createErrorReport(error, 'dom', owner, 'root-release'));
		return;
	}
	root.errors.report(error, { source: 'dom', phase: 'root-release' });
}
