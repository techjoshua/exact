import {
	type AnyComponentInstance,
	type AnyEnhancementComponentFunction,
	Suspense,
	createReadinessCoordinator,
	isVNode,
	normalizeRenderResult,
	withTaskObserver,
	type Child,
	type TaskObserver,
	type VNode
} from '@exactjs/core';
import {
	createComponentInstance,
	getCellVNode,
	isCellVNode,
	renderInstance
} from '@exactjs/core/runtime/render';
import { flushSync, unwrap } from '@exactjs/reactive';
import type { RenderToStringOptions, SsrContext } from '../types.js';
import { isSsrRenderInterruption, isSsrRenderLimitError } from './limits.js';
import { componentName, getComponentProps } from './component-vnode.js';
import { handleSsrConstructionError } from './construction-error-capability.js';
import { awaitWithAbort, drainTasks } from './context.js';
import { chargeEnhancementPlanning } from './enhancement-limits.js';
import { collectSsrEnhancementRoutes } from './enhancement-routing.js';
import { resolveSsrLogicalChildren } from './logical-children.js';
import { SsrReadinessOwner } from './readiness-owner.js';
import { createGenericSsrComponentInstance } from './generic-component-instance.js';

type SsrAsyncOptions = RenderToStringOptions & { taskDeadline?: number };

/** Materializes and routes one authored enhancement boundary for synchronous SSR. */
export function planSsrEnhancementBoundary(
	context: SsrContext,
	boundary: VNode,
	parent: AnyComponentInstance | undefined
): void {
	if (context.plannedEnhancementBoundaries.has(boundary)) return;
	const budget = { nodes: 0 };
	materializeSync(context, boundary, parent, 1, budget);
	collectSsrEnhancementRoutes(context, boundary, parent, 1, { nodes: 0 });
}

/** Materializes and routes one authored enhancement boundary for asynchronous SSR. */
export async function planSsrEnhancementBoundaryAsync(
	context: SsrContext,
	boundary: VNode,
	parent: AnyComponentInstance | undefined,
	options: SsrAsyncOptions
): Promise<void> {
	if (context.plannedEnhancementBoundaries.has(boundary)) return;
	const budget = { nodes: 0 };
	await materializeAsync(context, boundary, parent, options, 1, budget);
	collectSsrEnhancementRoutes(context, boundary, parent, 1, { nodes: 0 });
}

/** Prepares one `_target` subtree without requiring an enhancement declaration. */
export function prepareSsrTargetBoundary(
	context: SsrContext,
	boundary: VNode,
	parent: AnyComponentInstance | undefined
): void {
	if (context.plannedTargetBoundaries.has(boundary)) return;
	materializeSync(context, boundary, parent, 1, { nodes: 0 });
	context.plannedTargetBoundaries.add(boundary);
}

/** Asynchronously prepares one `_target` subtree and its durable state-machine instances. */
export async function prepareSsrTargetBoundaryAsync(
	context: SsrContext,
	boundary: VNode,
	parent: AnyComponentInstance | undefined,
	options: SsrAsyncOptions
): Promise<void> {
	if (context.plannedTargetBoundaries.has(boundary)) return;
	await materializeAsync(context, boundary, parent, options, 1, { nodes: 0 });
	context.plannedTargetBoundaries.add(boundary);
}

/**
 * Constructs the state-machine instances for the logical subtree needed by target discovery.
 * The prepared instances and finite expansions are transferred to the normal renderer.
 */
function materializeSync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	depth: number,
	budget: { nodes: number }
): void {
	chargeEnhancementPlanning(context, depth, budget);
	if (isCellVNode(vnode)) {
		materializeSync(context, getCellVNode(vnode), parent, depth + 1, budget);
		return;
	}
	if (vnode.type === Suspense) {
		const coordinator = createReadinessCoordinator(() => undefined);
		coordinator.beginGeneration();
		const owner = createComponentInstance(
			SsrReadinessOwner,
			{ context: coordinator.context },
			parent,
			context.componentContexts,
			context.componentDomain
		);
		try {
			for (const child of vnode.children) {
				if (isVNode(child)) materializeSync(context, child, owner, depth + 1, budget);
			}
			const pending = coordinator.pending > 0;
			const children = pending
				? normalizeRenderResult(unwrap(vnode.props.fallback) as Child | Child[])
				: vnode.children;
			if (pending) {
				for (const child of children) {
					if (isVNode(child)) materializeSync(context, child, parent, depth + 1, budget);
				}
			}
			context.preparedEnhancementSuspense.set(
				vnode,
				preparedSuspense(
					children,
					pending ? parent : owner,
					pending ? 'fallback' : 'content',
					coordinator,
					owner
				)
			);
		} catch (error) {
			coordinator.dispose();
			owner.unmount('ssr suspense planning failed');
			throw error;
		}
		return;
	}
	if (typeof vnode.type === 'function') {
		if (context.preparedEnhancementComponents.has(vnode)) return;
		const props = getComponentProps(vnode);
		let instance: AnyComponentInstance | undefined;
		let children: readonly Child[] = [];
		let failed = false;
		try {
			instance = createGenericSsrComponentInstance(
				context,
				vnode.type as AnyEnhancementComponentFunction,
				props,
				parent
			);
			context.onComponentCreated?.(instance);
			let stabilized = false;
			for (let pass = 0; pass < 25; pass++) {
				let invalidated = false;
				children = renderInstance(instance, () => {
					invalidated = true;
				});
				for (const child of children) {
					if (isVNode(child)) materializeSync(context, child, instance, depth + 1, budget);
				}
				flushSync();
				if (!invalidated) {
					stabilized = true;
					break;
				}
			}
			if (!stabilized)
				throw new Error('eXact SSR component did not stabilize after 25 render passes');
		} catch (error) {
			if (isSsrRenderLimitError(error)) throw error;
			failed = true;
			const fallback = handleSsrConstructionError(parent, error, componentName(vnode.type));
			children = fallback ? normalizeRenderResult(fallback()) : [];
			for (const child of children) {
				if (isVNode(child)) materializeSync(context, child, parent, depth + 1, budget);
			}
		}
		context.preparedEnhancementComponents.set(vnode, {
			instance,
			props,
			children,
			failed
		});
		return;
	}
	for (const child of resolveSsrLogicalChildren(context, vnode)) {
		if (isVNode(child)) materializeSync(context, child, parent, depth + 1, budget);
	}
}

/**
 * Materializes the same logical subtree while draining component-owned blocking work.
 * Abort, deadline, and traversal failures remain request failures rather than fallbacks.
 */
async function materializeAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: SsrAsyncOptions,
	depth: number,
	budget: { nodes: number }
): Promise<void> {
	chargeEnhancementPlanning(context, depth, budget);
	if (isCellVNode(vnode)) {
		await materializeAsync(context, getCellVNode(vnode), parent, options, depth + 1, budget);
		return;
	}
	if (vnode.type === Suspense) {
		const coordinator = createReadinessCoordinator(() => undefined, { commitSettled: true });
		coordinator.beginGeneration();
		const owner = createComponentInstance(
			SsrReadinessOwner,
			{ context: coordinator.context },
			parent,
			context.componentContexts,
			context.componentDomain
		);
		try {
			for (const child of vnode.children) {
				if (isVNode(child))
					await materializeAsync(context, child, owner, options, depth + 1, budget);
			}
			await awaitWithAbort(coordinator.whenReady(), options.signal, options.taskDeadline);
			context.preparedEnhancementSuspense.set(
				vnode,
				preparedSuspense(vnode.children, owner, 'content', coordinator, owner)
			);
		} catch (error) {
			coordinator.dispose();
			owner.unmount('ssr suspense planning failed');
			throw error;
		}
		return;
	}
	if (typeof vnode.type === 'function') {
		if (context.preparedEnhancementComponents.has(vnode)) return;
		const props = getComponentProps(vnode);
		let instance: AnyComponentInstance | undefined;
		let children: readonly Child[] = [];
		let failed = false;
		try {
			let pending: Set<Promise<unknown>> | undefined;
			const observer: TaskObserver = {
				register: (promise) => {
					const tasks = (pending ??= new Set());
					const observed = promise.finally(() => tasks.delete(observed));
					void observed.catch(() => undefined);
					tasks.add(observed);
				},
				retain() {}
			};
			instance = withTaskObserver(observer, () =>
				createGenericSsrComponentInstance(
					context,
					vnode.type as AnyEnhancementComponentFunction,
					props,
					parent
				)
			);
			context.onComponentCreated?.(instance);
			const maxPasses = options.maxTaskPasses ?? 10;
			if (pending) await drainTasks(pending, maxPasses, options.signal, options.taskDeadline);
			let stabilized = false;
			for (let pass = 0; pass < maxPasses; pass++) {
				let invalidated = false;
				children = renderInstance(instance, () => {
					invalidated = true;
				});
				for (const child of children) {
					if (isVNode(child))
						await materializeAsync(context, child, instance, options, depth + 1, budget);
				}
				if (pending) await drainTasks(pending, maxPasses, options.signal, options.taskDeadline);
				flushSync();
				if (!invalidated) {
					stabilized = true;
					break;
				}
			}
			if (!stabilized)
				throw new Error(
					`eXact async SSR component did not stabilize after ${maxPasses} render passes`
				);
		} catch (error) {
			if (isSsrRenderLimitError(error) || isSsrRenderInterruption(error, options.signal))
				throw error;
			failed = true;
			const fallback = handleSsrConstructionError(parent, error, componentName(vnode.type));
			children = fallback ? normalizeRenderResult(fallback()) : [];
			for (const child of children) {
				if (isVNode(child))
					await materializeAsync(context, child, parent, options, depth + 1, budget);
			}
		}
		context.preparedEnhancementComponents.set(vnode, {
			instance,
			props,
			children,
			failed
		});
		return;
	}
	for (const child of resolveSsrLogicalChildren(context, vnode)) {
		if (isVNode(child)) await materializeAsync(context, child, parent, options, depth + 1, budget);
	}
}

/** Owns the readiness bridge until its prepared Suspense candidate has rendered. */
function preparedSuspense(
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	status: 'content' | 'fallback',
	coordinator: ReturnType<typeof createReadinessCoordinator>,
	owner: AnyComponentInstance
): {
	readonly children: readonly Child[];
	readonly parent?: AnyComponentInstance;
	readonly status: 'content' | 'fallback';
	dispose(): void;
} {
	let disposed = false;
	return {
		children,
		parent,
		status,
		dispose() {
			if (disposed) return;
			disposed = true;
			coordinator.dispose();
			owner.unmount('ssr suspense complete');
		}
	};
}
