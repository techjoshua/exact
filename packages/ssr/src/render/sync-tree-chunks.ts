import {
	Activity,
	Dynamic,
	Fragment,
	Suspense,
	Target,
	Text,
	UnsafeHtml,
	isVNode,
	normalizeRenderResult,
	type AnyEnhancementComponentFunction,
	type VNode
} from '@exactjs/core';
import {
	ServerBoundary,
	ServerSlot,
	getCellVNode,
	isCellVNode,
	renderInstance
} from '@exactjs/core/runtime/render';
import { unwrap } from '@exactjs/reactive';
import { escapeText, voidElements } from '../html.js';
import { exactMarkerId, markerId, renderAttrs, suspenseStatusMarkerId } from '../markup.js';
import { SsrTreeDepthError, boundedJoin, countSsrNode, isSsrRenderLimitError } from './limits.js';
import type { AnyComponentInstance, Child, SsrContext } from '../types.js';
import {
	componentMarkerId,
	renderResumableComponentBoundary,
	serverSlotOpening,
	serverSlotVNodeReference
} from './boundaries.js';
import { renderClientBoundaryChunks } from './client-boundary-chunks.js';
import { componentName, getComponentProps } from './component-vnode.js';
import { handleSsrConstructionError } from './construction-errors.js';
import { activateSsrEnhancements } from './enhancements.js';
import {
	claimRootText,
	enterHost,
	leaveHost,
	reactHostContent,
	reactHostProps,
	registerReactImagePreload,
	renderUnsafeHtml
} from './host.js';
import {
	resolveSsrActivityChildren,
	resolveSsrDynamicChildren,
	resolveSsrFragmentChildren
} from './logical-children.js';
import { dynamicMarkerId } from './marker-identity.js';
import { renderNativeSuspenseSync } from './native-boundaries.js';
import { renderSsrProgramChunks } from './render-program.js';
import {
	createSsrComponentInstance,
	resolveSsrComponentExecution
} from './root-execution-cache.js';
import { renderChildren } from './sync-children.js';
import * as syncComponents from './sync-component.js';
import { createSsrChunkMarker } from './sync-markers.js';
import { applySsrTargetContributions } from './target-contributions.js';

/** Streams one synchronous VNode tree while preserving marker and ownership semantics. */
export function* renderVNodeChunks(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	depth: number
): Generator<string> {
	if (depth > context.maxTreeDepth) throw new SsrTreeDepthError(context.maxTreeDepth);
	countSsrNode(context);
	const enhanced = activateSsrEnhancements(context, vnode, parent);
	if (enhanced !== vnode) {
		yield* renderVNodeChunks(context, enhanced, parent, depth);
		return;
	}
	const marked = createSsrChunkMarker(context);

	if (isCellVNode(vnode)) {
		const id = markerId(context, 'cell', undefined, vnode.key);
		yield* marked(id, () => renderVNodeChunks(context, getCellVNode(vnode), parent, depth + 1));
		return;
	}
	const programChunks = renderSsrProgramChunks(context, vnode, parent, (fallback) =>
		renderVNodeChunks(context, fallback, parent, depth + 1)
	);
	if (programChunks) {
		yield* programChunks;
		return;
	}
	if (vnode.type === Text) {
		yield escapeText(String(unwrap(vnode.props.value) ?? ''));
		return;
	}
	if (vnode.type === UnsafeHtml) {
		const id = markerId(context, 'unsafe-html', undefined, vnode.key);
		yield* marked(id, function* () {
			yield renderUnsafeHtml(context, vnode);
		});
		return;
	}
	if (vnode.type === Activity) {
		const id = markerId(context, 'activity', undefined, vnode.key);
		yield* marked(id, function* () {
			for (const child of resolveSsrActivityChildren(context, vnode))
				yield* renderChildChunks(context, child, parent, depth + 1);
		});
		return;
	}
	if (vnode.type === Suspense) {
		const identity = markerId(context, 'suspense', undefined, vnode.key);
		const prepared = context.preparedEnhancementSuspense.get(vnode);
		if (prepared) {
			const id = suspenseStatusMarkerId(identity, prepared.status);
			try {
				yield* marked(id, function* () {
					for (const child of prepared.children)
						yield* renderChildChunks(context, child, prepared.parent, depth + 1);
				});
			} finally {
				prepared.dispose();
			}
			return;
		}
		const rendered = renderNativeSuspenseSync(context, vnode, parent, renderChildren);
		const id = suspenseStatusMarkerId(identity, rendered.status);
		yield* marked(id, function* () {
			yield rendered.html;
		});
		return;
	}
	if (vnode.type === Fragment) {
		const fragment = resolveSsrFragmentChildren(context, vnode);
		const id =
			fragment.list && vnode.key
				? exactMarkerId(vnode.key)
				: markerId(context, 'fragment', undefined, vnode.key);
		yield* marked(id, function* () {
			if (!fragment.list) {
				for (const child of fragment.children)
					yield* renderChildChunks(context, child, parent, depth + 1);
				return;
			}
			for (const child of fragment.children) {
				if (!isVNode(child)) continue;
				yield* marked(markerId(context, 'item', undefined, child.key), () =>
					renderVNodeChunks(context, child, parent, depth + 1)
				);
			}
		});
		return;
	}
	if (vnode.type === Target) {
		applySsrTargetContributions(context, vnode, parent);
		const id = markerId(context, 'target', undefined, vnode.key);
		yield* marked(id, function* () {
			for (const child of vnode.children)
				yield* renderChildChunks(context, child, parent, depth + 1);
		});
		return;
	}
	if (vnode.type === Dynamic) {
		const id = dynamicMarkerId(context, vnode);
		yield* marked(id, function* () {
			for (const child of resolveSsrDynamicChildren(context, vnode))
				yield* renderChildChunks(context, child, parent, depth + 1);
		});
		return;
	}
	if (vnode.type === ServerBoundary) {
		yield* renderClientBoundaryChunks(
			context,
			vnode,
			parent,
			depth,
			(child, owner, childDepth) => renderChildChunks(context, child, owner, childDepth),
			marked
		);
		return;
	}
	if (vnode.type === ServerSlot) {
		if (!vnode.children.length) return;
		yield serverSlotOpening(serverSlotVNodeReference(vnode), context);
		for (const child of vnode.children) yield* renderChildChunks(context, child, parent, depth + 1);
		yield '</span>';
		return;
	}
	if (typeof vnode.type === 'function') {
		yield* renderComponentChunks(context, vnode, parent, depth, marked);
		return;
	}

	const host = enterHost(context, vnode);
	const { vnode: hostVNode, tag } = host;
	try {
		const hostProps = reactHostProps(context, hostVNode);
		registerReactImagePreload(context, tag, hostProps);
		yield `${host.prefix}<${tag}${renderAttrs(hostProps, context.reactMarkup, tag, context)}${context.reactMarkup && voidElements.has(tag) ? '/' : ''}>`;
		if (voidElements.has(tag)) return;
		const raw = reactHostContent(context, hostVNode);
		if (raw !== undefined) yield raw;
		else {
			const previousSelect = context.selectValue;
			if (tag === 'select')
				context.selectValue = unwrap(hostVNode.props.value ?? hostVNode.props.defaultValue);
			try {
				for (const child of hostVNode.children)
					yield* renderChildChunks(context, child, parent, depth + 1);
			} finally {
				context.selectValue = previousSelect;
			}
		}
		yield `</${tag}>`;
	} finally {
		leaveHost(context, tag);
	}
}

function* renderComponentChunks(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	depth: number,
	marked: ReturnType<typeof createSsrChunkMarker>
): Generator<string> {
	const component = vnode.type as AnyEnhancementComponentFunction;
	const blueprint = resolveSsrComponentExecution(context, component);
	const componentId = componentMarkerId(context, vnode);
	const enhancement = context.enhancementVNodes.has(vnode);
	let childParent = parent;
	let children: Child[];
	let componentProps: Record<string, unknown> = {};
	const prepared = context.preparedEnhancementComponents.get(vnode);
	if (prepared) {
		componentProps = prepared.props;
		childParent = prepared.failed ? parent : (prepared.instance ?? parent);
		children = [...prepared.children];
	} else
		try {
			componentProps = getComponentProps(vnode);
			const instance = createSsrComponentInstance(
				context,
				component,
				componentProps,
				parent,
				blueprint
			);
			context.onComponentCreated?.(instance);
			childParent = instance;
			children = renderInstance(instance, () => undefined);
		} catch (error) {
			if (isSsrRenderLimitError(error)) throw error;
			const fallback = handleSsrConstructionError(parent, error, componentName(component));
			children = fallback ? normalizeRenderResult(fallback()) : [];
		}
	const rendered = function* () {
		for (const child of children) yield* renderChildChunks(context, child, childParent, depth + 1);
	};
	if (enhancement) yield* rendered();
	else if (context.documentProbe && context.hostStack.length === 0)
		yield* syncComponents.renderRootComponentChunks(context, componentId, rendered());
	else if (parent && blueprint.contract?.resumption)
		yield renderResumableComponentBoundary(
			context,
			vnode,
			componentId,
			boundedJoin(context, [...rendered()]),
			componentProps
		);
	else yield* marked(componentId, rendered);
}

/** Streams one child value, including scalar text and absent children. */
export function* renderChildChunks(
	context: SsrContext,
	child: Child,
	parent: AnyComponentInstance | undefined,
	depth: number
): Generator<string> {
	if (isVNode(child)) yield* renderVNodeChunks(context, child, parent, depth);
	else {
		countSsrNode(context);
		if (child === null || child === undefined || child === false || child === true) return;
		claimRootText(context);
		yield escapeText(String(unwrap(child)));
	}
}
