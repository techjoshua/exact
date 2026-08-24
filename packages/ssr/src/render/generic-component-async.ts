import { type AnyEnhancementComponentFunction, withTaskObserver } from '@exactjs/core';
import { renderInstance } from '@exactjs/core/runtime/render';
import { flushSync } from '@exactjs/reactive';
import type { AnyComponentInstance, TaskObserver } from '../types.js';
import { renderChildrenAsync } from './async-tree.js';
import { componentHtml } from './component-output.js';
import { prepareComponentProps } from './component-props.js';
import { drainTasks } from './context.js';
import { renderIssuedServerComponentChildren } from './direct-component.js';
import type { GenericSsrComponentInput } from './generic-component-capability.js';
import {
	disposeAsyncPreservingPrimary,
	disposePreservingPrimary,
	noPrimaryFailure
} from './ownership.js';
import { createGenericSsrComponentInstance } from './generic-component-instance.js';

const retainSsrComponent = (): void => {};

/** Executes the durable generic lane installed only by compiler-classified fallback artifacts. */
export async function renderGenericComponentAsync({
	context,
	vnode,
	parent,
	options,
	blueprint,
	rawProps,
	componentId,
	enhancement,
	documentProbe,
	hasComponentAncestor
}: GenericSsrComponentInput): Promise<string> {
	let instance: AnyComponentInstance | undefined;
	let primary: unknown = noPrimaryFailure;
	try {
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
						runTask: <T>(work: () => Promise<T>) => context.asyncScheduler.run(work, options.signal)
					}),
			retain: retainSsrComponent
		};
		const componentProps = await prepareComponentProps(
			rawProps,
			blueprint.contract.execution,
			options.signal
		);
		instance = withTaskObserver(observer, () =>
			createGenericSsrComponentInstance(
				context,
				vnode.type as AnyEnhancementComponentFunction,
				componentProps,
				parent
			)
		);
		options.onComponentCreated?.(instance);
		if (!blueprint.contract.execution && pending)
			await drainTasks(pending, options.maxTaskPasses ?? 10, options.signal, options.taskDeadline);
		let invalidated = false;
		const maxPasses = options.maxTaskPasses ?? 10;
		for (let pass = 0; pass < maxPasses; pass++) {
			invalidated = false;
			const issued = await renderIssuedServerComponentChildren(context, options, () =>
				renderInstance(instance!, () => {
					invalidated = true;
				})
			);
			let renderPrimary: unknown = noPrimaryFailure;
			let html: string;
			try {
				html = await renderChildrenAsync(context, issued.children, instance, options, true);
			} catch (error) {
				renderPrimary = error;
				throw error;
			} finally {
				if (issued.preparation)
					await disposeAsyncPreservingPrimary(
						() => Promise.resolve(issued.preparation![Symbol.asyncDispose]()),
						renderPrimary
					);
			}
			if (pending) await drainTasks(pending, maxPasses, options.signal, options.taskDeadline);
			flushSync();
			if (!invalidated)
				return componentHtml(context, vnode, componentId, html, componentProps, {
					enhancement,
					documentProbe,
					hasComponentAncestor
				});
		}
		throw new Error(`eXact async SSR component did not stabilize after ${maxPasses} render passes`);
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
