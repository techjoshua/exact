import { type AnyComponentFunction, normalizeRenderResult, type VNode } from '@exactjs/core';
import { markerPair } from '../markup.js';
import type { AnyComponentInstance, SsrContext } from '../types.js';
import { renderChildrenAsync } from './async-tree.js';
import { componentMarkerId } from './boundaries.js';
import { componentName, getComponentProps } from './component-vnode.js';
import { componentHtml } from './component-output.js';
import { handleSsrConstructionError } from './construction-error-capability.js';
import {
	createDirectScheduledSsrComponent,
	renderDirectSsrComponent,
	takePreparedDirectScheduledSsrComponent
} from './direct-component.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { renderGenericSsrComponent } from './generic-component-capability.js';
import { resetDocumentProbe } from './host.js';
import { isSsrRenderInterruption } from './limits.js';
import { disposeAsyncPreservingPrimary, noPrimaryFailure } from './ownership.js';
import { resolveSsrComponentExecution } from './root-execution-cache.js';

/** Renders a direct compiler artifact or delegates an explicitly selected generic component. */
export async function renderComponentAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): Promise<string> {
	const componentId = componentMarkerId(context, vnode);
	const enhancement = context.enhancementVNodes?.has(vnode) ?? false;
	const documentProbe = context.documentProbe && context.hostStack.length === 0;
	try {
		const prepared = context.preparedEnhancementComponents?.get(vnode);
		if (prepared) {
			if (documentProbe) resetDocumentProbe(context);
			const html = await renderChildrenAsync(
				context,
				prepared.children,
				prepared.failed ? parent : (prepared.instance ?? parent),
				options
			);
			return componentHtml(context, vnode, parent, componentId, html, prepared.props, {
				enhancement,
				documentProbe
			});
		}
		const blueprint = resolveSsrComponentExecution(context, vnode.type as AnyComponentFunction);
		const rawProps = getComponentProps(vnode);
		const scheduled = await (takePreparedDirectScheduledSsrComponent(context, vnode) ??
			createDirectScheduledSsrComponent(context, blueprint, rawProps, options));
		if (scheduled) {
			const constructionCheckpoint = context.onComponentAttemptCheckpoint?.();
			try {
				context.onDirectComponentCreated?.(scheduled.snapshot);
				const maxPasses = options.maxTaskPasses ?? 10;
				for (let pass = 0; pass < maxPasses; pass++) {
					const renderCheckpoint = context.onComponentAttemptCheckpoint?.();
					if (documentProbe) resetDocumentProbe(context);
					const issued = await scheduled.render();
					let renderPrimary: unknown = noPrimaryFailure;
					try {
						const html = await renderChildrenAsync(context, issued.children, parent, options);
						if (await scheduled.drain()) {
							context.onComponentAttemptRollback?.(renderCheckpoint);
							continue;
						}
						const output = componentHtml(
							context,
							vnode,
							parent,
							componentId,
							html,
							scheduled.props,
							{ enhancement, documentProbe }
						);
						context.onDirectComponentRendered?.(scheduled.snapshot);
						return output;
					} catch (error) {
						renderPrimary = error;
						context.onComponentAttemptRollback?.(renderCheckpoint);
						throw error;
					} finally {
						if (issued.preparation)
							await disposeAsyncPreservingPrimary(
								() => Promise.resolve(issued.preparation![Symbol.asyncDispose]()),
								renderPrimary
							);
					}
				}
				throw new Error(
					`eXact direct scheduled SSR component did not stabilize after ${maxPasses} render passes`
				);
			} catch (error) {
				context.onComponentAttemptRollback?.(constructionCheckpoint);
				throw error;
			} finally {
				await scheduled[Symbol.asyncDispose]();
			}
		}
		const direct = await renderDirectSsrComponent(context, blueprint, rawProps, options);
		if (direct) {
			const checkpoint = context.onComponentAttemptCheckpoint?.();
			try {
				context.onDirectComponentCreated?.(direct.snapshot);
				if (documentProbe) resetDocumentProbe(context);
				let directPrimary: unknown = noPrimaryFailure;
				let html: string;
				try {
					html = await renderChildrenAsync(context, direct.children, parent, options);
				} catch (error) {
					directPrimary = error;
					throw error;
				} finally {
					if (direct.preparation)
						await disposeAsyncPreservingPrimary(
							() => Promise.resolve(direct.preparation![Symbol.asyncDispose]()),
							directPrimary
						);
				}
				const output = componentHtml(context, vnode, parent, componentId, html, direct.props, {
					enhancement,
					documentProbe
				});
				context.onDirectComponentRendered?.(direct.snapshot);
				return output;
			} catch (error) {
				context.onComponentAttemptRollback?.(checkpoint);
				throw error;
			}
		}
		return await renderGenericSsrComponent({
			context,
			vnode,
			parent,
			options,
			blueprint,
			rawProps,
			componentId,
			enhancement,
			documentProbe
		});
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
}
