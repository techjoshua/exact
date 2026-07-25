import { type VNode } from '@exactjs/core';
import { unwrap } from '@exactjs/reactive';
import { escapeAttr } from '../html.js';
import { jsonUnsafePath, serializeHydrationPayload } from '../hydration.js';
import { markerId, markerPair } from '../markup.js';
import type {
	ComponentInstance,
	RenderToDocumentStreamOptions,
	RenderToStringOptions,
	SsrContext
} from '../types.js';
import { renderChildrenAsync } from './async-tree.js';
import { renderChildren } from './sync-tree.js';

/** Transforms server boundary into its required representation. */
export function renderServerBoundary(context: SsrContext, vnode: VNode): string {
	const id = String(unwrap(vnode.props.id) ?? '');
	const name = String(unwrap(vnode.props.name) ?? '');
	const hydration = clientBoundaryHydration(vnode);
	const props = clientBoundaryProps(vnode);
	const unsafePath = jsonUnsafePath(props);
	if (unsafePath) {
		throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	}
	const fallback = clientBoundaryHydrationFallback(vnode);
	const children = fallback
		? renderChildren(context, [fallback], undefined)
		: renderServerBoundaryChildren(context, vnode, undefined);
	// Client boundary props are serialized into an attribute, while children are
	// represented as server slots so the client bundle does not need server-only code.
	const html = `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload({ props }))}"${hydration ? ` data-exact-client-hydration="${hydration}" data-exact-client-generation="1"` : ''}>${children}</div>`;
	return markerPair(context, markerId(context, 'client-boundary', name, id), () => html);
}

/** Transforms server boundary async into its required representation. */
export async function renderServerBoundaryAsync(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined,
	options: RenderToStringOptions
): Promise<string> {
	const id = String(unwrap(vnode.props.id) ?? '');
	const name = String(unwrap(vnode.props.name) ?? '');
	const hydration = clientBoundaryHydration(vnode);
	const props = clientBoundaryProps(vnode);
	const unsafePath = jsonUnsafePath(props);
	if (unsafePath) {
		throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	}
	const fallback = clientBoundaryHydrationFallback(vnode);
	const slotId = serverSlotId(id);
	const children = fallback
		? await renderChildrenAsync(context, [fallback], parent, options)
		: vnode.children.length
			? `<span data-exact-server-slot="${escapeAttr(slotId)}" style="display: contents;">${await renderChildrenAsync(context, vnode.children, parent, options)}</span>`
			: '';
	const html = `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload({ props }))}"${hydration ? ` data-exact-client-hydration="${hydration}" data-exact-client-generation="1"` : ''}>${children}</div>`;
	return markerPair(context, markerId(context, 'client-boundary', name, id), () => html);
}

/** Performs the client boundary props domain operation. */
export function clientBoundaryProps(vnode: VNode): Record<string, unknown> {
	const id = String(unwrap(vnode.props.id) ?? '');
	const rawProps = unwrap(vnode.props.props) ?? {};
	const props =
		rawProps && typeof rawProps === 'object' && !Array.isArray(rawProps)
			? { ...(rawProps as Record<string, unknown>) }
			: rawProps;
	if (props && typeof props === 'object' && !Array.isArray(props)) {
		delete (props as Record<string, unknown>).__exactHydration;
		delete (props as Record<string, unknown>).__exactHydrationFallback;
	}
	if (
		vnode.children.length &&
		props &&
		typeof props === 'object' &&
		!Array.isArray(props) &&
		!('children' in props)
	) {
		(props as Record<string, unknown>).children = serverSlotPayload(serverSlotId(id));
	}
	return props as Record<string, unknown>;
}

/** Reads compiler-owned interaction hydration metadata without exposing it as component props. */
export function clientBoundaryHydration(vnode: VNode): 'interaction' | undefined {
	const props = unwrap(vnode.props.props);
	if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
	return (props as Record<string, unknown>).__exactHydration === 'interaction'
		? 'interaction'
		: undefined;
}

/** Reads the inert server-rendered VNode used by an interaction-activated client island. */
export function clientBoundaryHydrationFallback(vnode: VNode): VNode | undefined {
	const props = unwrap(vnode.props.props);
	if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
	const fallback = (props as Record<string, unknown>).__exactHydrationFallback;
	return fallback && typeof fallback === 'object' && 'type' in fallback
		? (fallback as VNode)
		: undefined;
}

/** Performs the client boundary serialization message domain operation. */
export function clientBoundarySerializationMessage(
	name: string,
	id: string,
	unsafePath: string
): string {
	const label = name || id;
	const location = name && id ? `${label} (${id})` : label;
	const generatedBucket = clientBoundaryGeneratedBucket(unsafePath);
	const generatedHint = generatedBucket ? ` in generated ${generatedBucket} payload` : '';
	return `Client boundary ${location} props must be JSON-serializable; non-serializable value at ${unsafePath}${generatedHint}`;
}

/** Performs the client boundary generated bucket domain operation. */
export function clientBoundaryGeneratedBucket(path: string): string | undefined {
	const match = /^\$\.(__exact[A-Za-z0-9_$]*)(?:\.|\[|$)/.exec(path);
	return match?.[1];
}

/** Transforms server boundary children into its required representation. */
export function renderServerBoundaryChildren(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined
): string {
	if (!vnode.children.length) return '';
	const slotId = serverSlotId(String(unwrap(vnode.props.id) ?? ''));
	return `<span data-exact-server-slot="${escapeAttr(slotId)}" style="display: contents;">${renderChildren(context, vnode.children, parent)}</span>`;
}

/** Performs the server slot id domain operation. */
export function serverSlotId(boundaryId: string): string {
	return `${boundaryId}:children`;
}

/** Performs the server slot payload domain operation. */
export function serverSlotPayload(id: string): Record<string, string> {
	return { __exactServerSlot: id };
}

/** Reports whether emit document hydration. */
export function shouldEmitDocumentHydration(options: RenderToDocumentStreamOptions): boolean {
	if (options.hydration === false) return false;
	if (options.hydration === true) return true;
	return (
		options.endpoint !== undefined ||
		options.endpoints !== undefined ||
		options.state !== undefined ||
		options.continuations !== undefined ||
		options.publicContexts !== undefined ||
		options.executionRoot !== undefined ||
		options.binding !== undefined ||
		options.buildKey !== undefined ||
		options.scriptId !== undefined ||
		options.nonce !== undefined
	);
}

/** Resolves a component props. */
export function getComponentProps(vnode: VNode): Record<string, unknown> {
	const props = { ...vnode.props };
	if (vnode.children.length === 1) props.children = vnode.children[0];
	else if (vnode.children.length > 1) props.children = vnode.children;
	return props;
}

/** Performs the component name domain operation. */
export function componentName(type: VNode['type']): string {
	return typeof type === 'function' ? type.name || 'anonymous' : String(type);
}
