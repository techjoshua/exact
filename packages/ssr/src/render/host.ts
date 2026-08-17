import { isVNode, normalizeDocumentVNode, type VNode } from '@exactjs/core';
import { unwrap } from '@exactjs/reactive';
import { escapeAttr, escapeText, voidElements } from '../html.js';
import { renderAttrs } from '../markup.js';
import type { Child, ComponentInstance, SsrContext } from '../types.js';
import { renderChildren } from './sync-tree.js';

/** Transforms element into its required representation. */
export function renderElement(
	context: SsrContext,
	vnode: VNode,
	parent?: ComponentInstance<any>
): string {
	const contributed = context.targetContributions.get(vnode);
	if (contributed) vnode = { ...vnode, props: contributed };
	const host = enterHost(context, vnode);
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
				content = renderChildren(context, hostVNode.children, parent);
			} finally {
				context.selectValue = previousSelect;
			}
		}
		return `${host.prefix}<${tag}${attrs}>${content}</${tag}>`;
	} finally {
		leaveHost(context, tag);
	}
}

/** Performs the enter host domain operation. */
export function enterHost(
	context: SsrContext,
	input: VNode
): { vnode: VNode; tag: string; prefix: string } {
	let vnode = input;
	const tag = String(vnode.type).toLowerCase();
	const parentTag = context.hostStack[context.hostStack.length - 1];

	if (tag === 'html') {
		if (!context.documentProbe || context.hostStack.length || context.documentRootSeen) {
			throw new Error(
				'A root document may contain exactly one top-level <html> element; nested or duplicate <html> elements are not allowed.'
			);
		}
		vnode = normalizeDocumentVNode(vnode);
		context.documentProbe = false;
		context.documentRootSeen = true;
	} else if (!context.hostStack.length) {
		if (context.documentRootSeen) {
			throw new Error('A root document cannot render host content outside its <html> element.');
		}
		context.documentProbe = false;
	}

	if (context.documentRootSeen && (tag === 'head' || tag === 'body')) {
		if (parentTag !== 'html') {
			throw new Error(`<${tag}> is only valid as a direct child of the root <html> element.`);
		}
		if (tag === 'head') {
			if (context.documentHeadSeen)
				throw new Error('A root document may contain at most one <head> element.');
			context.documentHeadSeen = true;
		} else {
			if (context.documentBodySeen)
				throw new Error('A root document may contain at most one <body> element.');
			context.documentBodySeen = true;
		}
	}

	context.hostStack.push(tag);
	return {
		vnode,
		tag,
		prefix: tag === 'html' && context.documentRootSeen ? '<!doctype html>' : ''
	};
}

/** Performs the leave host domain operation. */
export function leaveHost(context: SsrContext, tag: string): void {
	const current = context.hostStack.pop();
	if (current !== tag) throw new Error('eXact SSR host traversal became unbalanced.');
}

/** Performs the claim root text domain operation. */
export function claimRootText(context: SsrContext): void {
	if (context.hostStack.length) return;
	if (context.documentRootSeen)
		throw new Error('A root document cannot render text outside its <html> element.');
	context.documentProbe = false;
}

/** Performs the reset document probe domain operation. */
export function resetDocumentProbe(context: SsrContext): void {
	context.documentProbe = true;
	context.documentRootSeen = false;
	context.documentHeadSeen = false;
	context.documentBodySeen = false;
	context.hostStack.length = 0;
}

/** Performs the react host content domain operation. */
export function reactHostContent(context: SsrContext, vnode: VNode): string | undefined {
	const tag = String(vnode.type);
	if (!context.reactMarkup) {
		if (tag === 'script' || tag === 'style') return primitiveText(vnode.children);
		return undefined;
	}
	const value = vnode.props.dangerouslySetInnerHTML;
	if (value && typeof value === 'object' && '__html' in value) {
		if (vnode.children.length)
			throw new Error('Can only set one of `children` or `props.dangerouslySetInnerHTML`.');
		return String((value as { __html?: unknown }).__html ?? '');
	}
	if (tag === 'textarea') {
		const content =
			unwrap(vnode.props.value ?? vnode.props.defaultValue) ?? primitiveText(vnode.children);
		return escapeText(String(content ?? ''));
	}
	if (tag === 'style' || (tag === 'script' && context.reactMarkup === 19))
		return primitiveText(vnode.children);
	return undefined;
}

/** Transforms unsafe html into its required representation. */
export function renderUnsafeHtml(context: SsrContext, vnode: VNode): string {
	if (!context.allowUnsafeHtml) {
		throw new Error('unsafeHtml() requires allowUnsafeHtml: true on the native eXact SSR root.');
	}
	const html = String(unwrap(vnode.props.value) ?? '');
	context.onUnsafeHtml?.({ characters: html.length });
	return html;
}

/** Performs the primitive text domain operation. */
export function primitiveText(children: readonly Child[]): string {
	let text = '';
	for (const child of children) {
		if (child === null || child === undefined || child === false || child === true) continue;
		if (isVNode(child))
			throw new Error('React text-only host elements cannot contain an element child');
		text += String(unwrap(child));
	}
	return text;
}

/** Performs the react host props domain operation. */
export function reactHostProps(context: SsrContext, vnode: VNode): Record<string, unknown> {
	if (vnode.type !== 'option' || context.selectValue === undefined) return vnode.props;
	const value = String(unwrap(vnode.props.value) ?? primitiveText(vnode.children));
	const selected = Array.isArray(context.selectValue)
		? context.selectValue.some((item) => String(unwrap(item)) === value)
		: String(unwrap(context.selectValue)) === value;
	return { ...vnode.props, selected };
}

/** Performs the register react image preload domain operation. */
export function registerReactImagePreload(
	context: SsrContext,
	tag: string,
	props: Record<string, unknown>
): void {
	if (context.reactMarkup !== 19 || tag !== 'img') return;
	const src = unwrap(props.src);
	if (
		typeof src !== 'string' ||
		!src ||
		unwrap(props.loading) === 'lazy' ||
		unwrap(props.fetchPriority) === 'low'
	)
		return;
	const key = `image:${src}`;
	if (context.reactResourceKeys.has(key)) return;
	context.reactResourceKeys.add(key);
	const crossOrigin = unwrap(props.crossOrigin);
	const suffix =
		crossOrigin === undefined ? '' : ` crossorigin="${escapeAttr(String(crossOrigin))}"`;
	context.reactResourceHints.push(
		`<link rel="preload" as="image" href="${escapeAttr(src)}"${suffix}/>`
	);
}
