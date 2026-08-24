import {
	Activity,
	Dynamic,
	Fragment,
	Suspense,
	Target,
	Text,
	UnsafeHtml,
	isVNode,
	type VNode
} from '@exactjs/core';
import {
	ServerBoundary,
	ServerSlot,
	getCellVNode,
	isCellVNode
} from '@exactjs/core/framework/render-structure';
import { unwrap } from '@exactjs/reactive/framework/values';
import { escapeText } from '../html.js';
import {
	exactMarkerId,
	markerId,
	markerPair,
	suspenseStatusMarkerId,
	withMarker
} from '../markup.js';
import {
	assertOutputCharacterBound,
	boundedJoin,
	countSsrNode,
	enterSsrTreeDepth,
	leaveSsrTreeDepth
} from '../render/limits.js';
import type { AnyComponentInstance, SsrContext } from '../types.js';
import {
	resolveSsrActivityChildren,
	resolveSsrDynamicChildren,
	resolveSsrFragmentChildren
} from './logical-children.js';
import { dynamicMarkerId } from './marker-identity.js';
import { componentMarkerId } from './component-markers.js';
import { renderResumableComponentBoundary } from './resumption-boundary-capability.js';
import { renderServerBoundary } from './server-boundary-capability.js';
import { serverSlotOpening, serverSlotVNodeReference } from './server-slots.js';
import { renderElement, renderUnsafeHtml } from './host.js';
import { renderNativeSuspenseSync } from './structural-boundary-capability.js';
import {
	activateSsrEnhancements,
	applySsrTargetContributions
} from './enhancement-execution-capability.js';
import { renderChildren } from './sync-children.js';
import * as syncComponents from './sync-component.js';
import { renderSsrProgramString } from './render-program.js';

export { renderChildren } from './sync-children.js';
export { renderChildChunks, renderVNodeChunks } from './sync-tree-chunks.js';

const syncComponentOperations = {
	renderChildren,
	componentMarkerId,
	renderResumable: renderResumableComponentBoundary
};

/** Transforms vnode into its required representation. */
export function renderVNode(
	context: SsrContext,
	vnode: VNode,
	parent?: AnyComponentInstance
): string {
	enterSsrTreeDepth(context);
	try {
		countSsrNode(context);
		const html = renderVNodeInner(context, vnode, parent);
		assertOutputCharacterBound(context, html);
		return html;
	} finally {
		leaveSsrTreeDepth(context);
	}
}

/** Transforms vnode inner into its required representation. */
export function renderVNodeInner(
	context: SsrContext,
	vnode: VNode,
	parent?: AnyComponentInstance
): string {
	const enhanced = activateSsrEnhancements(context, vnode, parent);
	if (enhanced !== vnode) return renderVNode(context, enhanced, parent);
	if (isCellVNode(vnode)) {
		return withMarker(context, 'cell', vnode.key, () =>
			renderVNode(context, getCellVNode(vnode), parent)
		);
	}
	const program = renderSsrProgramString(
		context,
		vnode,
		parent,
		(fallback) => renderVNode(context, fallback, parent),
		(children) => renderChildren(context, children, parent)
	);
	if (program !== undefined) return program;

	if (vnode.type === Text) {
		return escapeText(String(unwrap(vnode.props.value) ?? ''));
	}

	if (vnode.type === UnsafeHtml) {
		return markerPair(context, markerId(context, 'unsafe-html', undefined, vnode.key), () =>
			renderUnsafeHtml(context, vnode)
		);
	}

	if (vnode.type === Activity) {
		return markerPair(context, markerId(context, 'activity', undefined, vnode.key), () =>
			renderChildren(context, resolveSsrActivityChildren(context, vnode), parent)
		);
	}

	if (vnode.type === Suspense) {
		const identity = markerId(context, 'suspense', undefined, vnode.key);
		const prepared = context.preparedEnhancementSuspense?.get(vnode);
		if (prepared) {
			try {
				return markerPair(context, suspenseStatusMarkerId(identity, prepared.status), () =>
					renderChildren(context, prepared.children, prepared.parent)
				);
			} finally {
				prepared.dispose();
			}
		}
		const rendered = renderNativeSuspenseSync(context, vnode, parent, renderChildren);
		return markerPair(
			context,
			suspenseStatusMarkerId(identity, rendered.status),
			() => rendered.html
		);
	}

	if (vnode.type === Fragment) {
		const fragment = resolveSsrFragmentChildren(context, vnode);
		const marker =
			fragment.list && vnode.key
				? exactMarkerId(vnode.key)
				: markerId(context, 'fragment', undefined, vnode.key);
		return markerPair(context, marker, () => {
			if (!fragment.list) return renderChildren(context, fragment.children, parent);
			const html: string[] = [];
			for (const child of fragment.children) {
				if (!isVNode(child)) continue;
				html.push(
					withMarker(context, 'item', child.key, () => renderVNode(context, child, parent))
				);
			}
			return boundedJoin(context, html);
		});
	}

	if (vnode.type === Target) {
		applySsrTargetContributions(context, vnode, parent);
		return markerPair(context, markerId(context, 'target', undefined, vnode.key), () =>
			renderChildren(context, vnode.children, parent)
		);
	}

	if (vnode.type === Dynamic) {
		const render = () => {
			return renderChildren(context, resolveSsrDynamicChildren(context, vnode), parent);
		};
		return vnode.props.__exactMarkerId
			? markerPair(context, dynamicMarkerId(context, vnode), render)
			: withMarker(context, 'dynamic', vnode.key, render);
	}

	if (vnode.type === ServerBoundary) {
		return renderServerBoundary(context, vnode);
	}

	if (vnode.type === ServerSlot) {
		if (!vnode.children.length) return '';
		return `${serverSlotOpening(serverSlotVNodeReference(vnode), context)}${renderChildren(context, vnode.children, parent)}</span>`;
	}

	if (typeof vnode.type === 'function') {
		return syncComponents.renderSyncComponent(context, vnode, parent, syncComponentOperations);
	}

	return renderElement(context, vnode, parent);
}
