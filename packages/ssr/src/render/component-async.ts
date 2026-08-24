import { type AnyComponentFunction, normalizeRenderResult, type VNode } from '@exactjs/core';
import { markerPair } from '../markup.js';
import type { AnyComponentInstance, SsrContext } from '../types.js';
import { renderChildrenAsync } from './async-tree.js';
import { componentMarkerId } from './component-markers.js';
import { componentName, getComponentProps } from './component-vnode.js';
import { componentHtml } from './component-output.js';
import { handleSsrConstructionError } from './construction-error-capability.js';
import { renderDirectSsrComponentOutput } from './direct-component.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { renderGenericSsrComponent } from './generic-component-capability.js';
import { resetDocumentProbe } from './host.js';
import { isSsrRenderInterruption } from './limits.js';
import { resolveSsrComponentExecution } from './root-execution-cache.js';

type DirectComponentPublication = Readonly<{
	componentId: string;
	documentProbe: boolean;
	enhancement: boolean;
}>;

function publishDirectComponent(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	html: string,
	props: Record<string, unknown>,
	publication: DirectComponentPublication
): string {
	return componentHtml(context, vnode, parent, publication.componentId, html, props, publication);
}

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
		const direct = await renderDirectSsrComponentOutput(
			context,
			vnode,
			parent,
			options,
			async (children, owner) => {
				if (documentProbe) resetDocumentProbe(context);
				return renderChildrenAsync(context, children, owner, options);
			},
			publishDirectComponent,
			{ componentId, enhancement, documentProbe }
		);
		if (direct !== undefined) return direct;
		const blueprint = resolveSsrComponentExecution(context, vnode.type as AnyComponentFunction);
		const rawProps = getComponentProps(vnode);
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
