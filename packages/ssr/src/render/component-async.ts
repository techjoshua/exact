import {
	type AnyComponentFunction,
	type AnyEnhancementComponentFunction,
	withTaskObserver,
	normalizeRenderResult,
	type VNode
} from '@exactjs/core';
import { renderInstance } from '@exactjs/core/runtime/render';
import { flushSync } from '@exactjs/reactive';
import type { AnyComponentInstance, SsrContext, TaskObserver } from '../types.js';
import { isSsrRenderInterruption } from './limits.js';
import { componentMarkerId, renderResumableComponentBoundary } from './boundaries.js';
import { componentName, getComponentProps } from './component-vnode.js';
import { prepareComponentProps } from './component-props.js';
import { handleSsrConstructionError } from './construction-errors.js';
import { drainTasks } from './context.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { disposePreservingPrimary, noPrimaryFailure } from './ownership.js';
import { renderChildrenAsync } from './async-tree.js';
import { markerPair } from '../markup.js';
import { resetDocumentProbe } from './host.js';
import {
	createSsrComponentInstance,
	resolveSsrComponentExecution
} from './root-execution-cache.js';

const retainSsrComponent = (): void => {};

/** Renders one component while its compiler-planned dependencies issue under durable ownership. */
export async function renderComponentAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): Promise<string> {
	const componentId = componentMarkerId(context, vnode);
	const enhancement = context.enhancementVNodes.has(vnode);
	const documentProbe = context.documentProbe && context.hostStack.length === 0;
	let instance: AnyComponentInstance | undefined;
	let primary: unknown = noPrimaryFailure;
	try {
		try {
			const prepared = context.preparedEnhancementComponents.get(vnode);
			if (prepared) {
				instance = prepared.instance;
				if (documentProbe) resetDocumentProbe(context);
				const html = await renderChildrenAsync(
					context,
					prepared.children,
					prepared.failed ? parent : (instance ?? parent),
					options
				);
				return componentHtml(context, vnode, parent, componentId, html, prepared.props, {
					enhancement,
					documentProbe
				});
			}
			let pending: Set<Promise<unknown>> | undefined;
			const observer: TaskObserver = {
				register: (promise) => {
					const tasks = (pending ??= new Set());
					const observed = promise.finally(() => tasks.delete(observed));
					void observed.catch(() => undefined);
					tasks.add(observed);
				},
				...(context.asyncFrame
					? {}
					: {
							runTask: <T>(work: () => Promise<T>) =>
								context.asyncScheduler.run(work, options.signal)
						}),
				retain: retainSsrComponent
			};
			const blueprint = resolveSsrComponentExecution(context, vnode.type as AnyComponentFunction);
			const componentProps = await prepareComponentProps(
				getComponentProps(vnode),
				blueprint.execution,
				options.signal
			);
			instance = withTaskObserver(observer, () =>
				createSsrComponentInstance(
					context,
					vnode.type as AnyEnhancementComponentFunction,
					componentProps,
					parent,
					blueprint
				)
			);
			options.onComponentCreated?.(instance);
			if (!blueprint.execution && pending)
				await drainTasks(
					pending,
					options.maxTaskPasses ?? 10,
					options.signal,
					options.taskDeadline
				);
			let invalidated = false;
			const maxPasses = options.maxTaskPasses ?? 10;
			for (let pass = 0; pass < maxPasses; pass++) {
				if (documentProbe) resetDocumentProbe(context);
				invalidated = false;
				const children = renderInstance(instance, () => {
					invalidated = true;
				});
				const html = await renderChildrenAsync(context, children, instance, options);
				if (pending) await drainTasks(pending, maxPasses, options.signal, options.taskDeadline);
				flushSync();
				if (!invalidated)
					return componentHtml(context, vnode, parent, componentId, html, componentProps, {
						enhancement,
						documentProbe
					});
			}
			throw new Error(
				`eXact async SSR component did not stabilize after ${maxPasses} render passes`
			);
		} catch (error) {
			if (isSsrRenderInterruption(error, options.signal)) throw error;
			const fallback = handleSsrConstructionError(parent, error, componentName(vnode.type));
			const html = fallback
				? await renderChildrenAsync(context, normalizeRenderResult(fallback()), parent, options)
				: '';
			return enhancement || (documentProbe && context.documentRootSeen)
				? html
				: markerPair(context, componentId, () => html);
		}
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		if (instance) {
			try {
				if (primary === noPrimaryFailure) options.onComponentRendered?.(instance);
			} finally {
				disposePreservingPrimary(
					() => instance!.unmount(String(options.signal?.reason ?? 'ssr render complete')),
					primary
				);
			}
		}
	}
}

function componentHtml(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	componentId: string,
	html: string,
	props: Record<string, unknown>,
	flags: { enhancement: boolean; documentProbe: boolean }
): string {
	return flags.enhancement || (flags.documentProbe && context.documentRootSeen)
		? html
		: parent
			? renderResumableComponentBoundary(context, vnode, componentId, html, props)
			: markerPair(context, componentId, () => html);
}
