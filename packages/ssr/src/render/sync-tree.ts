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
	type VNode
} from '@exactjs/core';
import { unwrap } from '@exactjs/reactive';
import { escapeAttr, escapeText, voidElements } from '../html.js';
import { jsonUnsafePath, serializeHydrationPayload } from '../hydration.js';
import { exactMarkerId, markerId, markerPair, renderAttrs, withMarker } from '../markup.js';
import {
	SsrTreeDepthError,
	assertOutputCharacterBound,
	boundedJoin,
	countSsrNode,
	isSsrRenderLimitError,
	withSsrTreeDepth
} from '../render/limits.js';
import type { Child, ComponentFunction, ComponentInstance, SsrContext } from '../types.js';
import { renderComponent } from './async-tree.js';
import {
	clientBoundaryProps,
	clientBoundarySerializationMessage,
	componentName,
	getComponentProps,
	renderServerBoundary,
	serverSlotId
} from './boundaries.js';
import {
	claimRootText,
	enterHost,
	leaveHost,
	reactHostContent,
	reactHostProps,
	registerReactImagePreload,
	renderElement,
	renderUnsafeHtml
} from './host.js';

/** Transforms vnode chunks into its required representation. */
export function* renderVNodeChunks(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined,
	depth: number
): Generator<string> {
	if (depth > context.maxTreeDepth) throw new SsrTreeDepthError(context.maxTreeDepth);
	countSsrNode(context);
	const marked = function* (id: string, content: () => Generator<string>): Generator<string> {
		if (context.markers) yield `<!--exact:${id}-->`;
		yield* content();
		if (context.markers) yield `<!--/exact:${id}-->`;
	};

	if (isCellVNode(vnode)) {
		const id = markerId(context, 'cell', undefined, vnode.key);
		yield* marked(id, () => renderVNodeChunks(context, getCellVNode(vnode), parent, depth + 1));
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
	if (vnode.type === Fragment) {
		const list = vnode.props.list as
			| {
					collection: Iterable<unknown>;
					source?: { get(): Iterable<unknown> };
					key(item: unknown): string;
					render(item: unknown): VNode;
			  }
			| undefined;
		const id =
			list && vnode.key
				? exactMarkerId(vnode.key)
				: markerId(context, 'fragment', undefined, vnode.key);
		yield* marked(id, function* () {
			if (!list) {
				for (const child of vnode.children)
					yield* renderChildChunks(context, child, parent, depth + 1);
				return;
			}
			const collection = list.source ? list.source.get() : list.collection;
			for (const item of collection) {
				const key = String(list.key(item));
				const child = list.render(item);
				yield* marked(markerId(context, 'item', undefined, key), () =>
					renderVNodeChunks(context, { ...child, key }, parent, depth + 1)
				);
			}
		});
		return;
	}
	if (vnode.type === Dynamic) {
		const id = markerId(context, 'dynamic', undefined, vnode.key);
		yield* marked(id, function* () {
			for (const child of normalizeRenderResult(unwrap(vnode.props.value) as Child | Child[])) {
				yield* renderChildChunks(context, child, parent, depth + 1);
			}
		});
		return;
	}
	if (vnode.type === ServerBoundary) {
		const id = String(unwrap(vnode.props.id) ?? '');
		const name = String(unwrap(vnode.props.name) ?? '');
		const props = clientBoundaryProps(vnode);
		const unsafePath = jsonUnsafePath(props);
		if (unsafePath) throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
		const marker = markerId(context, 'client-boundary', name, id);
		yield* marked(marker, function* () {
			yield `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload({ props }))}">`;
			if (vnode.children.length) {
				yield `<span data-exact-server-slot="${escapeAttr(serverSlotId(id))}" style="display: contents;">`;
				for (const child of vnode.children)
					yield* renderChildChunks(context, child, parent, depth + 1);
				yield '</span>';
			}
			yield '</div>';
		});
		return;
	}
	if (vnode.type === ServerSlot) return;
	if (typeof vnode.type === 'function') {
		const componentId = markerId(context, 'component', componentName(vnode.type), vnode.key);
		let childParent = parent;
		let children: Child[];
		try {
			const instance = createComponentInstance(
				vnode.type as ComponentFunction<any, Record<string, unknown>>,
				getComponentProps(vnode),
				parent,
				context.componentContexts
			);
			context.onComponentCreated?.(instance);
			childParent = instance;
			children = renderInstance(instance, () => undefined);
		} catch (error) {
			if (isSsrRenderLimitError(error)) throw error;
			const fallback = handleComponentError(
				parent,
				createErrorReport(error, 'construct', parent, componentName(vnode.type))
			);
			children = fallback ? normalizeRenderResult(fallback()) : [];
		}
		// Construction is recoverable before bytes are emitted. Once a component
		// starts streaming, descendant failures fail the stream rather than
		// appending fallback HTML after an already-emitted partial boundary.
		const rendered = function* () {
			for (const child of children)
				yield* renderChildChunks(context, child, childParent, depth + 1);
		};
		if (context.documentProbe && context.hostStack.length === 0) {
			yield* renderRootComponentChunks(context, componentId, rendered());
		} else {
			yield* marked(componentId, rendered);
		}
		return;
	}

	const host = enterHost(context, vnode);
	const hostVNode = host.vnode;
	const tag = host.tag;
	try {
		const hostProps = reactHostProps(context, hostVNode);
		registerReactImagePreload(context, tag, hostProps);
		yield `${host.prefix}<${tag}${renderAttrs(hostProps, context.reactMarkup, tag)}${context.reactMarkup && voidElements.has(tag) ? '/' : ''}>`;
		if (voidElements.has(tag)) return;
		const raw = reactHostContent(context, hostVNode);
		if (raw !== undefined) yield raw;
		else {
			const previousSelect = context.reactSelectValue;
			if (context.reactMarkup && tag === 'select')
				context.reactSelectValue = unwrap(hostVNode.props.value ?? hostVNode.props.defaultValue);
			try {
				for (const child of hostVNode.children)
					yield* renderChildChunks(context, child, parent, depth + 1);
			} finally {
				context.reactSelectValue = previousSelect;
			}
		}
		yield `</${tag}>`;
	} finally {
		leaveHost(context, tag);
	}
}

/** Transforms root component chunks into its required representation. */
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

/** Transforms child chunks into its required representation. */
export function* renderChildChunks(
	context: SsrContext,
	child: Child,
	parent: ComponentInstance<any> | undefined,
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

/** Transforms children into its required representation. */
export function renderChildren(
	context: SsrContext,
	children: readonly Child[],
	parent?: ComponentInstance<any>
): string {
	const html: string[] = [];
	let previousWasText = false;
	for (const child of children) {
		const rendered = renderChild(context, child, parent);
		const isText = !isVNode(child) && rendered !== '';
		if (context.textSeparators && isText && previousWasText) html.push('<!-- -->');
		if (rendered !== '') html.push(rendered);
		if (isVNode(child)) previousWasText = false;
		else if (isText) previousWasText = true;
	}
	return boundedJoin(context, html);
}

/** Transforms child into its required representation. */
export function renderChild(
	context: SsrContext,
	child: Child,
	parent?: ComponentInstance<any>
): string {
	if (isVNode(child)) return renderVNode(context, child, parent);
	countSsrNode(context);
	if (child === null || child === undefined || child === false || child === true) return '';
	claimRootText(context);
	return escapeText(String(unwrap(child)));
}

/** Transforms vnode into its required representation. */
export function renderVNode(
	context: SsrContext,
	vnode: VNode,
	parent?: ComponentInstance<any>
): string {
	return withSsrTreeDepth(context, () => {
		countSsrNode(context);
		const html = renderVNodeInner(context, vnode, parent);
		assertOutputCharacterBound(context, html);
		return html;
	});
}

/** Transforms vnode inner into its required representation. */
export function renderVNodeInner(
	context: SsrContext,
	vnode: VNode,
	parent?: ComponentInstance<any>
): string {
	if (isCellVNode(vnode)) {
		return withMarker(context, 'cell', vnode.key, () =>
			renderVNode(context, getCellVNode(vnode), parent)
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
		return markerPair(context, marker, () => {
			if (!list) return renderChildren(context, vnode.children, parent);
			const collection = list.source ? list.source.get() : list.collection;
			const html: string[] = [];
			for (const item of collection) {
				const child = list.render(item);
				html.push(
					withMarker(context, 'item', String(list.key(item)), () =>
						renderVNode(context, { ...child, key: String(list.key(item)) }, parent)
					)
				);
			}
			return boundedJoin(context, html);
		});
	}

	if (vnode.type === Dynamic) {
		return withMarker(context, 'dynamic', vnode.key, () => {
			return renderChildren(
				context,
				normalizeRenderResult(unwrap(vnode.props.value) as Child | Child[]),
				parent
			);
		});
	}

	if (vnode.type === ServerBoundary) {
		return renderServerBoundary(context, vnode);
	}

	if (vnode.type === ServerSlot) {
		return '';
	}

	if (typeof vnode.type === 'function') {
		return renderComponent(context, vnode, parent);
	}

	return renderElement(context, vnode, parent);
}
