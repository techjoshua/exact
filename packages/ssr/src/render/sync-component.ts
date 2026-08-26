import {
	type AnyComponentInstance,
	type AnyComponentFunction,
	normalizeRenderResult,
	type Child,
	type VNode
} from '@exactjs/core';
import { readPreparedExactCompiledComponentContract } from '@exactjs/core/framework/component-contracts';
import { markerPair } from '../markup.js';
import type { SsrContext } from '../types.js';
import { componentName, getComponentProps } from './component-vnode.js';
import { handleSsrConstructionError } from './construction-error-capability.js';
import { resetDocumentProbe } from './host.js';
import { isSsrRenderLimitError } from './limits.js';
import { renderDirectSsrComponent } from './direct-component.js';
import { renderPreparedSsrProgramString } from './render-program.js';
import { renderGenericSyncSsrComponent } from './generic-component-capability.js';
import { resolveSsrComponentExecution } from './root-execution-cache.js';

/** Renderer operations supplied by the sync tree without creating an import cycle. */
export type SyncComponentOperations = Readonly<{
	renderChildren(
		context: SsrContext,
		children: readonly Child[],
		parent?: AnyComponentInstance,
		hasComponentAncestor?: boolean
	): string;
	renderVNode(
		context: SsrContext,
		vnode: VNode,
		parent?: AnyComponentInstance,
		hasComponentAncestor?: boolean,
		omitCompilerOwnedBoundary?: boolean
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
	parent: AnyComponentInstance | undefined,
	hasComponentAncestor: boolean,
	operations: SyncComponentOperations,
	omitCompilerOwnedBoundary = false
): string {
	const componentId = operations.componentMarkerId(context, vnode);
	const enhancement = context.enhancementVNodes?.has(vnode) ?? false;
	const documentProbe = context.documentProbe && context.hostStack.length === 0;
	let instance: AnyComponentInstance | undefined;
	let output!: string;
	try {
		const prepared = context.preparedEnhancementComponents?.get(vnode);
		if (prepared) {
			instance = prepared.instance;
			if (documentProbe) resetDocumentProbe(context);
			const html = operations.renderChildren(
				context,
				prepared.children,
				prepared.failed ? parent : (instance ?? parent),
				true
			);
			output = componentOutput(
				context,
				vnode,
				componentId,
				html,
				prepared.props,
				enhancement,
				documentProbe,
				hasComponentAncestor,
				operations,
				omitCompilerOwnedBoundary
			);
			if (instance) context.onComponentRendered?.(instance);
			return output;
		}
		const componentProps = getComponentProps(vnode);
		const blueprint = resolveSsrComponentExecution(context, vnode.type as AnyComponentFunction);
		const direct = renderDirectSsrComponent(context, blueprint, componentProps, parent);
		if (direct) {
			const checkpoint = context.onComponentAttemptCheckpoint?.();
			try {
				context.onDirectComponentCreated?.(direct.snapshot);
				if (documentProbe) resetDocumentProbe(context);
				const html = direct.content.program
					? renderPreparedSsrProgramString(
							context,
							direct.content.program,
							direct.owner,
							(fallback) => operations.renderVNode(context, fallback, direct.owner, true),
							(children) => operations.renderChildren(context, children, direct.owner, true),
							(component) => operations.renderVNode(context, component, direct.owner, true, true)
						)
					: operations.renderChildren(context, direct.content.children, direct.owner, true);
				const directOutput = componentOutput(
					context,
					vnode,
					componentId,
					html,
					direct.props,
					enhancement,
					documentProbe,
					hasComponentAncestor,
					operations,
					omitCompilerOwnedBoundary
				);
				context.onDirectComponentRendered?.(direct.snapshot);
				return directOutput;
			} catch (error) {
				context.onComponentAttemptRollback?.(checkpoint);
				throw error;
			}
		}
		if (documentProbe) resetDocumentProbe(context);
		const generic = renderGenericSyncSsrComponent({
			context,
			vnode,
			parent,
			operations,
			blueprint,
			rawProps: componentProps,
			onInstance: (created) => {
				instance = created;
			}
		});
		output = componentOutput(
			context,
			vnode,
			componentId,
			generic.html,
			generic.props,
			enhancement,
			documentProbe,
			hasComponentAncestor,
			operations,
			omitCompilerOwnedBoundary
		);
	} catch (error) {
		if (isSsrRenderLimitError(error)) throw error;
		const fallback = handleSsrConstructionError(parent, error, componentName(vnode.type));
		const html = fallback
			? operations.renderChildren(
					context,
					normalizeRenderResult(fallback()),
					parent,
					hasComponentAncestor
				)
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
	componentId: string,
	html: string,
	props: Record<string, unknown>,
	enhancement: boolean,
	documentProbe: boolean,
	hasComponentAncestor: boolean,
	operations: SyncComponentOperations,
	omitCompilerOwnedBoundary: boolean
): string {
	const resumable =
		readPreparedExactCompiledComponentContract(vnode.type as AnyComponentFunction).continuations
			.length !== 0;
	if (
		enhancement ||
		(documentProbe && context.documentRootSeen) ||
		(omitCompilerOwnedBoundary && !resumable)
	)
		return html;
	return hasComponentAncestor
		? operations.renderResumable(context, vnode, componentId, html, props)
		: markerPair(context, componentId, () => html);
}
