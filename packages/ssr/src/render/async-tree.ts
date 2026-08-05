import {
	Activity,
	Dynamic,
	Fragment,
	ServerBoundary,
	ServerSlot,
	Suspense,
	Target,
	Text,
	UnsafeHtml,
	createComponentInstance,
	createReadinessCoordinator,
	getCellVNode,
	isCellVNode,
	isVNode,
	normalizeRenderResult,
	renderInstance,
	withTaskObserver,
	type VNode
} from '@exactjs/core';
import { flushSync, unwrap } from '@exactjs/reactive';
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
	isSsrRenderInterruption,
	withSsrTreeDepthAsync
} from '../render/limits.js';
import type {
	Child,
	ComponentFunction,
	ComponentInstance,
	RenderToStringOptions,
	SsrContext,
	TaskObserver
} from '../types.js';
import {
	componentMarkerId,
	renderResumableComponentBoundary,
	renderServerBoundaryAsync,
	serverSlotOpening,
	serverSlotVNodeReference
} from './boundaries.js';
import { componentName, getComponentProps } from './component-vnode.js';
import { handleSsrConstructionError } from './construction-errors.js';
import { awaitWithAbort, drainTasks } from './context.js';
import { type SsrRenderOptions } from './entrypoints.js';
import { SsrReadinessOwner } from './readiness-owner.js';
import {
	claimRootText,
	enterHost,
	leaveHost,
	reactHostContent,
	reactHostProps,
	registerReactImagePreload,
	renderUnsafeHtml,
	resetDocumentProbe
} from './host.js';
import { disposePreservingPrimary, noPrimaryFailure } from './ownership.js';
import { markDynamic } from './marker-identity.js';
import {
	resolveSsrActivityChildren,
	resolveSsrDynamicChildren,
	resolveSsrFragmentChildren
} from './logical-children.js';
import { activateSsrEnhancementsAsync } from './enhancements.js';
import { applySsrTargetContributionsAsync } from './target-contributions.js';

/** Transforms children async into its required representation. */
export async function renderChildrenAsync(
	context: SsrContext,
	children: readonly Child[],
	parent: ComponentInstance<any> | undefined,
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
	parent: ComponentInstance<any> | undefined,
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
	parent: ComponentInstance<any> | undefined,
	options: SsrRenderOptions
): Promise<string> {
	return withSsrTreeDepthAsync(context, async () => {
		countSsrNode(context);
		const html = await renderVNodeAsyncInner(context, vnode, parent, options);
		assertOutputCharacterBound(context, html);
		return html;
	});
}

/** Transforms vnode async inner into its required representation. */
export async function renderVNodeAsyncInner(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined,
	options: SsrRenderOptions
): Promise<string> {
	const enhanced = await activateSsrEnhancementsAsync(context, vnode, parent, options);
	if (enhanced !== vnode) return renderVNodeAsync(context, enhanced, parent, options);
	if (isCellVNode(vnode)) {
		return markerPair(context, markerId(context, 'cell', undefined, vnode.key), async () =>
			renderVNodeAsync(context, getCellVNode(vnode), parent, options)
		);
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
			const previousSelect = context.reactSelectValue;
			if (context.reactMarkup && tag === 'select')
				context.reactSelectValue = unwrap(hostVNode.props.value ?? hostVNode.props.defaultValue);
			try {
				content = await renderChildrenAsync(context, hostVNode.children, parent, options);
			} finally {
				context.reactSelectValue = previousSelect;
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
	parent: ComponentInstance<any> | undefined,
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

/** Transforms component async into its required representation. */
export async function renderComponentAsync(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined,
	options: SsrRenderOptions
): Promise<string> {
	const componentId = componentMarkerId(context, vnode);
	const enhancement = context.enhancementVNodes.has(vnode);
	const documentProbe = context.documentProbe && context.hostStack.length === 0;
	let instance: ComponentInstance<any> | undefined;
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
				return enhancement
					? html
					: documentProbe && context.documentRootSeen
						? html
						: parent
							? renderResumableComponentBoundary(context, vnode, componentId, html, prepared.props)
							: markerPair(context, componentId, () => html);
			}
			const pending = new Set<Promise<unknown>>();
			const observer: TaskObserver = {
				register: (promise) => {
					const observed = promise.finally(() => pending.delete(observed));
					void observed.catch(() => undefined);
					pending.add(observed);
				},
				retain() {}
			};
			const componentProps = getComponentProps(vnode);
			instance = withTaskObserver(observer, () =>
				createComponentInstance(
					vnode.type as ComponentFunction<any, Record<string, unknown>>,
					componentProps,
					parent,
					context.componentContexts,
					context.componentDomain
				)
			);
			options.onComponentCreated?.(instance);
			await drainTasks(pending, options.maxTaskPasses ?? 10, options.signal, options.taskDeadline);
			let invalidated = false;
			const maxPasses = options.maxTaskPasses ?? 10;
			for (let pass = 0; pass < maxPasses; pass++) {
				if (documentProbe) resetDocumentProbe(context);
				invalidated = false;
				const children = renderInstance(instance!, () => {
					invalidated = true;
				});
				const html = await renderChildrenAsync(context, children, instance, options);
				await drainTasks(pending, maxPasses, options.signal, options.taskDeadline);
				flushSync();
				if (!invalidated)
					return enhancement
						? html
						: documentProbe && context.documentRootSeen
							? html
							: parent
								? renderResumableComponentBoundary(
										context,
										vnode,
										componentId,
										html,
										componentProps
									)
								: markerPair(context, componentId, () => html);
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
			return enhancement
				? html
				: documentProbe && context.documentRootSeen
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
