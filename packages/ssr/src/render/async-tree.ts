import {
	Activity,
	Dynamic,
	Fragment,
	Suspense,
	Target,
	Text,
	UnsafeHtml,
	createReadinessCoordinator,
	hasIndependentAsyncSiblings,
	isVNode,
	type VNode
} from '@exactjs/core';
import {
	RenderProgram,
	ServerBoundary,
	ServerSlot,
	createComponentInstance,
	getCellVNode,
	isCellVNode
} from '@exactjs/core/runtime/render';
import { unwrap } from '@exactjs/reactive';
import { escapeText, voidElements } from '../html.js';
import {
	exactMarkerId,
	markerId,
	markerPair,
	renderAttrs,
	suspenseStatusMarkerId
} from '../markup.js';
import {
	assertOutputCharacterBound,
	boundedJoin,
	countSsrNode,
	enterSsrTreeDepth,
	leaveSsrTreeDepth
} from '../render/limits.js';
import type { AnyComponentInstance, Child, RenderToStringOptions, SsrContext } from '../types.js';
import {
	renderServerBoundaryAsync,
	serverSlotOpening,
	serverSlotVNodeReference
} from './boundaries.js';
import { awaitWithAbort } from './context.js';
import { type SsrRenderOptions } from './entrypoints.js';
import { SsrReadinessOwner } from './readiness-owner.js';
import {
	claimRootText,
	enterHost,
	leaveHost,
	reactHostContent,
	reactHostProps,
	registerReactImagePreload,
	renderUnsafeHtml
} from './host.js';
import { markDynamic } from './marker-identity.js';
import {
	resolveSsrActivityChildren,
	resolveSsrDynamicChildren,
	resolveSsrFragmentChildren
} from './logical-children.js';
import { activateSsrEnhancementsAsync } from './enhancements.js';
import { applySsrTargetContributionsAsync } from './target-contributions.js';
import { renderSsrProgram } from './render-program.js';
import { canRenderIndependentChildren, renderIndependentChildren } from './async-independent.js';
import { renderComponentAsync } from './component-async.js';
import { canRenderSsrSubtreeSynchronously } from './sync-fast-path.js';
import { renderVNode } from './sync-tree.js';

/** Transforms children async into its required representation. */
export async function renderChildrenAsync(
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions
): Promise<string> {
	const html: string[] = [];
	let previousWasText = false;
	for (const child of children) {
		const rendered = await renderChildAsync(context, child, parent, options);
		const isText = !isVNode(child) && rendered !== '';
		if (context.textSeparators && isText && previousWasText) html.push('<!-- -->');
		if (rendered !== '') html.push(rendered);
		if (isVNode(child)) previousWasText = false;
		else if (isText) previousWasText = true;
	}
	return boundedJoin(context, html);
}

/** Transforms child async into its required representation. */
export async function renderChildAsync(
	context: SsrContext,
	child: Child,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions
): Promise<string> {
	if (isVNode(child)) return renderVNodeAsync(context, child, parent, options);
	countSsrNode(context);
	if (child === null || child === undefined || child === false || child === true) return '';
	claimRootText(context);
	return escapeText(String(unwrap(child)));
}

/** Transforms vnode async into its required representation. */
export async function renderVNodeAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): Promise<string> {
	if (canRenderSsrSubtreeSynchronously(context, vnode)) return renderVNode(context, vnode, parent);
	enterSsrTreeDepth(context);
	try {
		countSsrNode(context);
		const html = await renderVNodeAsyncInner(context, vnode, parent, options);
		assertOutputCharacterBound(context, html);
		return html;
	} finally {
		leaveSsrTreeDepth(context);
	}
}

/** Transforms vnode async inner into its required representation. */
export async function renderVNodeAsyncInner(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): Promise<string> {
	const enhanced = await activateSsrEnhancementsAsync(context, vnode, parent, options);
	if (enhanced !== vnode) return renderVNodeAsync(context, enhanced, parent, options);
	if (isCellVNode(vnode)) {
		return markerPair(context, markerId(context, 'cell', undefined, vnode.key), async () =>
			renderVNodeAsync(context, getCellVNode(vnode), parent, options)
		);
	}
	if (vnode.type === RenderProgram) {
		const planned = renderSsrProgram(context, vnode, parent);
		return planned.fallback
			? renderVNodeAsync(context, planned.fallback, parent, options)
			: planned.html!;
	}

	if (vnode.type === Text) {
		return escapeText(String(unwrap(vnode.props.value) ?? ''));
	}

	if (vnode.type === UnsafeHtml) {
		return markerPair(context, markerId(context, 'unsafe-html', undefined, vnode.key), () =>
			renderUnsafeHtml(context, vnode)
		);
	}

	if (vnode.type === Activity) {
		return markerPair(context, markerId(context, 'activity', undefined, vnode.key), async () =>
			renderChildrenAsync(context, resolveSsrActivityChildren(context, vnode), parent, options)
		);
	}

	if (vnode.type === Suspense) {
		const identity = markerId(context, 'suspense', undefined, vnode.key);
		const prepared = context.preparedEnhancementSuspense.get(vnode);
		if (prepared) {
			try {
				return await markerPair(context, suspenseStatusMarkerId(identity, prepared.status), () =>
					renderChildrenAsync(context, prepared.children, prepared.parent, options)
				);
			} finally {
				prepared.dispose();
			}
		}
		const rendered = await renderNativeSuspenseAsync(context, vnode, parent, options);
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
		return markerPair(context, marker, async () => {
			if (!fragment.list) return renderChildrenAsync(context, fragment.children, parent, options);
			const html: string[] = [];
			for (const child of fragment.children) {
				if (!isVNode(child)) continue;
				html.push(
					await markerPair(context, markerId(context, 'item', undefined, child.key), () =>
						renderVNodeAsync(context, child, parent, options)
					)
				);
			}
			return boundedJoin(context, html);
		});
	}

	if (vnode.type === Target) {
		await applySsrTargetContributionsAsync(context, vnode, parent, options);
		return markerPair(context, markerId(context, 'target', undefined, vnode.key), () =>
			renderChildrenAsync(context, vnode.children, parent, options)
		);
	}

	if (vnode.type === Dynamic) {
		return markDynamic(context, vnode, async () =>
			renderChildrenAsync(context, resolveSsrDynamicChildren(context, vnode), parent, options)
		);
	}

	if (vnode.type === ServerBoundary) {
		return renderServerBoundaryAsync(context, vnode, parent, options);
	}

	if (vnode.type === ServerSlot) {
		if (!vnode.children.length) return '';
		return `${serverSlotOpening(serverSlotVNodeReference(vnode), context)}${await renderChildrenAsync(context, vnode.children, parent, options)}</span>`;
	}

	if (typeof vnode.type === 'function') {
		return renderComponentAsync(context, vnode, parent, options);
	}

	const contributed = context.targetContributions.get(vnode);
	const host = enterHost(context, contributed ? { ...vnode, props: contributed } : vnode);
	const hostVNode = host.vnode;
	const tag = host.tag;
	try {
		const hostProps = reactHostProps(context, hostVNode);
		registerReactImagePreload(context, tag, hostProps);
		const attrs = renderAttrs(hostProps, context.reactMarkup, tag, context);
		if (voidElements.has(tag))
			return `${host.prefix}<${tag}${attrs}${context.reactMarkup ? '/' : ''}>`;
		const raw = reactHostContent(context, hostVNode);
		let content: string;
		if (raw !== undefined) content = raw;
		else {
			const previousSelect = context.selectValue;
			if (tag === 'select')
				context.selectValue = unwrap(hostVNode.props.value ?? hostVNode.props.defaultValue);
			try {
				content =
					hasIndependentAsyncSiblings(hostVNode) && canRenderIndependentChildren(context, options)
						? await renderIndependentChildren(
								context,
								hostVNode.children,
								parent,
								options,
								renderChildAsync
							)
						: await renderChildrenAsync(context, hostVNode.children, parent, options);
			} finally {
				context.selectValue = previousSelect;
			}
		}
		return `${host.prefix}<${tag}${attrs}>${content}</${tag}>`;
	} finally {
		leaveHost(context, tag);
	}
}

async function renderNativeSuspenseAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
): Promise<{ readonly html: string; readonly status: 'content' | 'fallback' }> {
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
		const maxPasses = options.maxTaskPasses ?? 10;
		for (let pass = 0; pass < maxPasses; pass++) {
			if (pass) coordinator.beginGeneration();
			const candidate = await renderChildrenAsync(context, vnode.children, owner, options);
			const readiness = await awaitWithAbort(
				coordinator.whenReady(),
				options.signal,
				options.taskDeadline
			);
			if (readiness.generation !== coordinator.generation) continue;
			if (readiness.retry) continue;
			return { html: candidate, status: 'content' };
		}
		throw new Error(
			`eXact async SSR Suspense boundary did not stabilize after ${maxPasses} render passes`
		);
	} finally {
		coordinator.dispose();
		owner.unmount('ssr suspense complete');
	}
}
