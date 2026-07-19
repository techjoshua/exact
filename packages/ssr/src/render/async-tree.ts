import {
	Dynamic,
	Fragment,
	ServerBoundary,
	ServerSlot,
	Text,
	UnsafeHtml,
	createComponentInstance,
	createErrorReport,
	getCellVNode,
	handleComponentError,
	isCellVNode,
	isVNode,
	normalizeRenderResult,
	renderInstance,
	withTaskObserver,
	type VNode
} from '@exact/core';
import { flushSync, unwrap } from '@exact/reactive';
import { escapeText, voidElements } from '../html.js';
import { exactMarkerId, markerId, markerPair, renderAttrs } from '../markup.js';
import {
	assertOutputCharacterBound,
	boundedJoin,
	countSsrNode,
	isSsrRenderInterruption,
	isSsrRenderLimitError,
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
import { componentName, getComponentProps, renderServerBoundaryAsync } from './boundaries.js';
import { drainTasks } from './context.js';
import { type SsrRenderOptions } from './entrypoints.js';
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
import { renderChildren } from './sync-tree.js';

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

	if (vnode.type === Fragment) {
		const list = vnode.props.list as
			| {
					collection: Iterable<unknown>;
					source?: { get(): Iterable<unknown> };
					key(item: unknown): string;
					render(item: unknown): VNode;
			  }
			| undefined;
		const marker =
			list && vnode.key
				? exactMarkerId(vnode.key)
				: markerId(context, 'fragment', undefined, vnode.key);
		return markerPair(context, marker, async () => {
			if (!list) return renderChildrenAsync(context, vnode.children, parent, options);
			const collection = list.source ? list.source.get() : list.collection;
			const html: string[] = [];
			for (const item of collection) {
				const key = String(list.key(item));
				const child = list.render(item);
				html.push(
					await markerPair(context, markerId(context, 'item', undefined, key), async () =>
						renderVNodeAsync(context, { ...child, key }, parent, options)
					)
				);
			}
			return boundedJoin(context, html);
		});
	}

	if (vnode.type === Dynamic) {
		return markerPair(context, markerId(context, 'dynamic', undefined, vnode.key), async () => {
			return renderChildrenAsync(
				context,
				normalizeRenderResult(unwrap(vnode.props.value) as Child | Child[]),
				parent,
				options
			);
		});
	}

	if (vnode.type === ServerBoundary) {
		return renderServerBoundaryAsync(context, vnode, parent, options);
	}

	if (vnode.type === ServerSlot) {
		return '';
	}

	if (typeof vnode.type === 'function') {
		return renderComponentAsync(context, vnode, parent, options);
	}

	const host = enterHost(context, vnode);
	const hostVNode = host.vnode;
	const tag = host.tag;
	try {
		const hostProps = reactHostProps(context, hostVNode);
		registerReactImagePreload(context, tag, hostProps);
		const attrs = renderAttrs(hostProps, context.reactMarkup, tag);
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

/** Transforms component into its required representation. */
export function renderComponent(
	context: SsrContext,
	vnode: VNode,
	parent?: ComponentInstance<any>
): string {
	const componentId = markerId(context, 'component', componentName(vnode.type), vnode.key);
	const documentProbe = context.documentProbe && context.hostStack.length === 0;
	try {
		const instance = createComponentInstance(
			vnode.type as ComponentFunction<any, Record<string, unknown>>,
			getComponentProps(vnode),
			parent,
			context.componentContexts
		);
		let invalidated = false;
		for (let pass = 0; pass < 25; pass++) {
			if (documentProbe) resetDocumentProbe(context);
			invalidated = false;
			const children = renderInstance(instance, () => {
				invalidated = true;
			});
			const html = renderChildren(context, children, instance);
			flushSync();
			if (!invalidated)
				return documentProbe && context.documentRootSeen
					? html
					: markerPair(context, componentId, () => html);
		}
		throw new Error('eXact SSR component did not stabilize after 25 render passes');
	} catch (error) {
		if (isSsrRenderLimitError(error)) throw error;
		const fallback = handleComponentError(
			parent,
			createErrorReport(error, 'construct', parent, componentName(vnode.type))
		);
		const html = fallback ? renderChildren(context, normalizeRenderResult(fallback()), parent) : '';
		return documentProbe && context.documentRootSeen
			? html
			: markerPair(context, componentId, () => html);
	}
}

/** Transforms component async into its required representation. */
export async function renderComponentAsync(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined,
	options: SsrRenderOptions
): Promise<string> {
	const componentId = markerId(context, 'component', componentName(vnode.type), vnode.key);
	const documentProbe = context.documentProbe && context.hostStack.length === 0;
	let instance: ComponentInstance<any> | undefined;
	let primary: unknown = noPrimaryFailure;
	try {
		try {
			const pending = new Set<Promise<unknown>>();
			const observer: TaskObserver = {
				register: (promise) => {
					const observed = promise.finally(() => pending.delete(observed));
					pending.add(observed);
				},
				retain() {}
			};
			instance = withTaskObserver(observer, () =>
				createComponentInstance(
					vnode.type as ComponentFunction<any, Record<string, unknown>>,
					getComponentProps(vnode),
					parent,
					context.componentContexts
				)
			);
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
					return documentProbe && context.documentRootSeen
						? html
						: markerPair(context, componentId, () => html);
			}
			throw new Error(
				`eXact async SSR component did not stabilize after ${maxPasses} render passes`
			);
		} catch (error) {
			if (isSsrRenderInterruption(error, options.signal)) throw error;
			const fallback = handleComponentError(
				parent,
				createErrorReport(error, 'construct', parent, componentName(vnode.type))
			);
			const html = fallback
				? await renderChildrenAsync(context, normalizeRenderResult(fallback()), parent, options)
				: '';
			return documentProbe && context.documentRootSeen
				? html
				: markerPair(context, componentId, () => html);
		}
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		if (instance)
			disposePreservingPrimary(
				() => instance!.unmount(String(options.signal?.reason ?? 'ssr render complete')),
				primary
			);
	}
}
