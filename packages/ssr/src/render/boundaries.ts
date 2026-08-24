import { isFiniteClientBoundary, type VNode } from '@exactjs/core';
import { unwrap } from '@exactjs/reactive/framework/values';
import { escapeAttr } from '../html.js';
import { jsonUnsafePath, serializeHydrationPayload } from '../hydration.js';
import { markerId, markerPair } from '../markup.js';
import type {
	AnyComponentInstance,
	RenderToStringOptions,
	SsrContext
} from '../types.js';
import { renderChildrenAsync } from './async-tree.js';
import { clientBoundarySerializationMessage } from './client-boundary-validation.js';
import { publishClientBoundary } from './client-boundary-publication.js';
import {
	serverSlotId,
	serverSlotOpening,
	serverSlotPayload,
	serverSlotReference,
	type ExactServerSlotReference
} from './server-slots.js';
import { renderChildren } from './sync-tree.js';

/** Transforms server boundary into its required representation. */
export function renderServerBoundary(context: SsrContext, vnode: VNode): string {
	const id = String(unwrap(vnode.props.id) ?? '');
	const name = String(unwrap(vnode.props.name) ?? '');
	const hydration = clientBoundaryHydration(vnode);
	const props = clientBoundaryProps(context, vnode);
	const finite = isFiniteClientBoundary(vnode);
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
	const html = publishClientBoundary(context, name, id, props, hydration, finite, children);
	return markerPair(context, markerId(context, 'client-boundary', name, id), () => html);
}

/** Transforms server boundary async into its required representation. */
export async function renderServerBoundaryAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions
): Promise<string> {
	const id = String(unwrap(vnode.props.id) ?? '');
	const name = String(unwrap(vnode.props.name) ?? '');
	const hydration = clientBoundaryHydration(vnode);
	const props = clientBoundaryProps(context, vnode);
	const finite = isFiniteClientBoundary(vnode);
	const unsafePath = jsonUnsafePath(props);
	if (unsafePath) {
		throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	}
	const fallback = clientBoundaryHydrationFallback(vnode);
	const slots = serverBoundarySlotReferences(vnode);
	const children = fallback
		? await renderChildrenAsync(context, [fallback], parent, options)
		: slots
			? await boundedServerRangeChildrenAsync(context, vnode, slots, parent, options)
			: vnode.children.length
				? `<span data-exact-server-slot="${escapeAttr(serverSlotId(id))}" style="display: contents;">${await renderChildrenAsync(context, vnode.children, parent, options)}</span>`
				: '';
	const html = publishClientBoundary(context, name, id, props, hydration, finite, children);
	return markerPair(context, markerId(context, 'client-boundary', name, id), () => html);
}

/** Performs the client boundary props domain operation. */
export function clientBoundaryProps(context: SsrContext, vnode: VNode): Record<string, unknown> {
	const id = String(unwrap(vnode.props.id) ?? '');
	const rawProps = unwrap(vnode.props.props) ?? {};
	const props =
		rawProps && typeof rawProps === 'object' && !Array.isArray(rawProps)
			? { ...(rawProps as Record<string, unknown>) }
			: rawProps;
	if (props && typeof props === 'object' && !Array.isArray(props)) {
		delete (props as Record<string, unknown>).__exactHydration;
		delete (props as Record<string, unknown>).__exactHydrationFallback;
		delete (props as Record<string, unknown>).__exactServerSlots;
	}
	const slots = serverBoundarySlotReferences(vnode);
	for (const slot of slots ?? []) {
		if (slot.buildKey && context.buildKey && slot.buildKey !== context.buildKey)
			throw new Error('Client boundary partition build does not match the SSR build');
	}
	if (
		vnode.children.length &&
		props &&
		typeof props === 'object' &&
		!Array.isArray(props) &&
		!('children' in props)
	) {
		const children = slots?.map((slot) => serverSlotPayload(slot, context));
		(props as Record<string, unknown>).children = children
			? children.length === 1
				? children[0]
				: children
			: serverSlotPayload({ id: serverSlotId(id) }, context);
	}
	return props as Record<string, unknown>;
}

/** Reads compiler-owned interaction hydration metadata without exposing it as component props. */
export function clientBoundaryHydration(vnode: VNode): 'interaction' | 'eager' | undefined {
	const props = unwrap(vnode.props.props);
	if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
	const hydration = (props as Record<string, unknown>).__exactHydration;
	return hydration === 'interaction' || hydration === 'eager' ? hydration : undefined;
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

/** Transforms server boundary children into its required representation. */
export function renderServerBoundaryChildren(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined
): string {
	if (!vnode.children.length) return '';
	const slots = serverBoundarySlotReferences(vnode);
	if (slots) {
		return vnode.children
			.map(
				(child, index) =>
					`${serverSlotOpening(slots[index]!, context)}${renderChildren(context, [child], parent)}</span>`
			)
			.join('');
	}
	const slotId = serverSlotId(String(unwrap(vnode.props.id) ?? ''));
	return `<span data-exact-server-slot="${escapeAttr(slotId)}" style="display: contents;">${renderChildren(context, vnode.children, parent)}</span>`;
}

/** Reads and validates compiler-owned independent range identities. */
export function serverBoundarySlotIds(vnode: VNode): readonly string[] | undefined {
	return serverBoundarySlotReferences(vnode)?.map((slot) => slot.id);
}

/** Reads and validates compiler-owned independent range authority. */
export function serverBoundarySlotReferences(
	vnode: VNode
): readonly ExactServerSlotReference[] | undefined {
	const props = unwrap(vnode.props.props);
	if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
	const value = (props as Record<string, unknown>).__exactServerSlots;
	if (value === undefined) return undefined;
	if (
		!Array.isArray(value) ||
		value.length !== vnode.children.length ||
		value.some((entry) => !serverSlotReference(entry))
	) {
		throw new Error('Client boundary partition slots must uniquely identify every server child');
	}
	const slots = value.map((entry) =>
		typeof entry === 'string'
			? ({ id: entry } satisfies ExactServerSlotReference)
			: {
					id: (entry as Record<string, unknown>).__exactServerSlot,
					planVersion: (entry as Record<string, unknown>).planVersion,
					buildKey: (entry as Record<string, unknown>).buildKey,
					planEdgeId: (entry as Record<string, unknown>).planEdgeId,
					ownerComponentId: (entry as Record<string, unknown>).ownerComponentId,
					discriminator: (entry as Record<string, unknown>).discriminator,
					generation: (entry as Record<string, unknown>).generation
				}
	) as ExactServerSlotReference[];
	if (new Set(slots.map((slot) => slot.id)).size !== slots.length)
		throw new Error('Client boundary partition slots must uniquely identify every server child');
	return slots;
}

async function boundedServerRangeChildrenAsync(
	context: SsrContext,
	vnode: VNode,
	slots: readonly ExactServerSlotReference[],
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions
): Promise<string> {
	const ranges = await Promise.all(
		vnode.children.map(
			async (child, index) =>
				`${serverSlotOpening(slots[index]!, context)}${await renderChildrenAsync(context, [child], parent, options)}</span>`
		)
	);
	return ranges.join('');
}
