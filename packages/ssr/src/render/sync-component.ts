import {
	normalizeRenderResult,
	renderInstance,
	type Child,
	type ComponentFunction,
	type ComponentInstance,
	type VNode
} from '@exactjs/core';
import { flushSync } from '@exactjs/reactive';
import { markerPair } from '../markup.js';
import type { SsrContext } from '../types.js';
import { componentName, getComponentProps } from './component-vnode.js';
import { handleSsrConstructionError } from './construction-errors.js';
import { resetDocumentProbe } from './host.js';
import { isSsrRenderLimitError } from './limits.js';
import {
	createSsrComponentInstance,
	resolveSsrComponentExecution
} from './root-execution-cache.js';

/** Renderer operations supplied by the sync tree without creating an import cycle. */
export type SyncComponentOperations = Readonly<{
	renderChildren(
		context: SsrContext,
		children: readonly Child[],
		parent?: ComponentInstance<any>
	): string;
	componentMarkerId(context: SsrContext, vnode: VNode): string;
	renderResumable(
		context: SsrContext,
		vnode: VNode,
		id: string,
		html: string,
		props: Record<string, unknown>
	): string;
}>;

/** Renders one synchronous component, consuming target-planning work when available. */
export function renderSyncComponent(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined,
	operations: SyncComponentOperations
): string {
	const componentId = operations.componentMarkerId(context, vnode);
	const enhancement = context.enhancementVNodes.has(vnode);
	const documentProbe = context.documentProbe && context.hostStack.length === 0;
	let instance: ComponentInstance<any> | undefined;
	let output!: string;
	try {
		const prepared = context.preparedEnhancementComponents.get(vnode);
		if (prepared) {
			instance = prepared.instance;
			if (documentProbe) resetDocumentProbe(context);
			const html = operations.renderChildren(
				context,
				prepared.children,
				prepared.failed ? parent : (instance ?? parent)
			);
			output = componentOutput(
				context,
				vnode,
				parent,
				componentId,
				html,
				prepared.props,
				enhancement,
				documentProbe,
				operations
			);
			if (instance) context.onComponentRendered?.(instance);
			return output;
		}
		const componentProps = getComponentProps(vnode);
		const blueprint = resolveSsrComponentExecution(context, vnode.type as ComponentFunction<any>);
		instance = createSsrComponentInstance(
			context,
			vnode.type as ComponentFunction<any, Record<string, unknown>>,
			componentProps,
			parent,
			blueprint
		);
		context.onComponentCreated?.(instance);
		let stabilized = false;
		for (let pass = 0; pass < 25; pass++) {
			if (documentProbe) resetDocumentProbe(context);
			let invalidated = false;
			const children = renderInstance(instance, () => {
				invalidated = true;
			});
			const html = operations.renderChildren(context, children, instance);
			flushSync();
			if (invalidated) continue;
			output = componentOutput(
				context,
				vnode,
				parent,
				componentId,
				html,
				componentProps,
				enhancement,
				documentProbe,
				operations
			);
			stabilized = true;
			break;
		}
		if (!stabilized)
			throw new Error('eXact SSR component did not stabilize after 25 render passes');
	} catch (error) {
		if (isSsrRenderLimitError(error)) throw error;
		const fallback = handleSsrConstructionError(parent, error, componentName(vnode.type));
		const html = fallback
			? operations.renderChildren(context, normalizeRenderResult(fallback()), parent)
			: '';
		output =
			enhancement || (documentProbe && context.documentRootSeen)
				? html
				: markerPair(context, componentId, () => html);
	}
	if (instance) context.onComponentRendered?.(instance);
	return output;
}

/** Streams a root component while deciding document mode from its first output chunk. */
export function* renderRootComponentChunks(
	context: SsrContext,
	componentId: string,
	rendered: Generator<string>
): Generator<string> {
	const first = rendered.next();
	const document = context.documentRootSeen;
	if (!document && context.markers) yield `<!--exact:${componentId}-->`;
	if (!first.done) yield first.value;
	yield* rendered;
	if (!document && context.markers) yield `<!--/exact:${componentId}-->`;
}

function componentOutput(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined,
	componentId: string,
	html: string,
	props: Record<string, unknown>,
	enhancement: boolean,
	documentProbe: boolean,
	operations: SyncComponentOperations
): string {
	if (enhancement || (documentProbe && context.documentRootSeen)) return html;
	return parent
		? operations.renderResumable(context, vnode, componentId, html, props)
		: markerPair(context, componentId, () => html);
}
