import type { Child } from '@exactjs/core';
import type { ExactServerBoundaryReceiptData } from '@exactjs/core/runtime/component-abi';
import { unwrap } from '@exactjs/reactive/framework/values';
import { escapeAttr } from '../html.js';
import { jsonUnsafePath } from '../hydration.js';
import { markerId, markerPair } from '../markup.js';
import type { AnyComponentInstance, RenderToStringOptions, SsrContext } from '../types.js';
import { renderChildrenAsync } from './async-children.js';
import { clientBoundarySerializationMessage } from './client-boundary-validation.js';
import { publishClientBoundary } from './client-boundary-publication.js';
import {
	serverSlotId,
	serverSlotOpening,
	serverSlotPayload,
	serverSlotReference,
	type ExactServerSlotReference
} from './server-slots.js';
import { renderChildren } from './sync-children.js';

/** Transforms server boundary into its required representation. */
export function renderServerBoundary(
	context: SsrContext,
	boundary: ExactServerBoundaryReceiptData,
	finite = false
): string {
	const { id, name } = boundary;
	const hydration = clientBoundaryHydration(boundary);
	const props = clientBoundaryProps(context, boundary);
	const unsafePath = jsonUnsafePath(props);
	if (unsafePath) {
		throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	}
	const fallback = clientBoundaryHydrationFallback(boundary);
	const children = fallback
		? renderChildren(context, [fallback], undefined, true)
		: renderServerBoundaryChildren(context, boundary, undefined);
	// Client boundary props are serialized into an attribute, while children are
	// represented as server slots so the client bundle does not need server-only code.
	const html = publishClientBoundary(context, name, id, props, hydration, finite, children);
	return markerPair(context, markerId(context, 'client-boundary', name, id), () => html);
}

/** Transforms server boundary async into its required representation. */
export async function renderServerBoundaryAsync(
	context: SsrContext,
	boundary: ExactServerBoundaryReceiptData,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	finite = false
): Promise<string> {
	const { id, name } = boundary;
	const hydration = clientBoundaryHydration(boundary);
	const props = clientBoundaryProps(context, boundary);
	const unsafePath = jsonUnsafePath(props);
	if (unsafePath) {
		throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	}
	const fallback = clientBoundaryHydrationFallback(boundary);
	const slots = serverBoundarySlotReferences(boundary);
	const children = fallback
		? await renderChildrenAsync(context, [fallback], parent, options, true)
		: slots
			? await boundedServerRangeChildrenAsync(context, boundary, slots, parent, options)
			: boundary.children.length
				? `<span data-exact-server-slot="${escapeAttr(serverSlotId(id))}" style="display: contents;">${await renderChildrenAsync(context, boundary.children, parent, options, true)}</span>`
				: '';
	const html = publishClientBoundary(context, name, id, props, hydration, finite, children);
	return markerPair(context, markerId(context, 'client-boundary', name, id), () => html);
}

/** Performs the client boundary props domain operation. */
export function clientBoundaryProps(
	context: SsrContext,
	boundary: ExactServerBoundaryReceiptData
): Record<string, unknown> {
	const id = boundary.id;
	const rawProps = unwrap(boundary.props) ?? {};
	const props =
		rawProps && typeof rawProps === 'object' && !Array.isArray(rawProps)
			? { ...(rawProps as Record<string, unknown>) }
			: rawProps;
	if (props && typeof props === 'object' && !Array.isArray(props)) {
		delete (props as Record<string, unknown>).__exactHydration;
		delete (props as Record<string, unknown>).__exactHydrationFallback;
		delete (props as Record<string, unknown>).__exactServerSlots;
	}
	const slots = serverBoundarySlotReferences(boundary);
	for (const slot of slots ?? []) {
		if (slot.buildKey && context.buildKey && slot.buildKey !== context.buildKey)
			throw new Error('Client boundary partition build does not match the SSR build');
	}
	if (
		boundary.children.length &&
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
export function clientBoundaryHydration(
	boundary: ExactServerBoundaryReceiptData
): 'interaction' | 'eager' | undefined {
	const props = unwrap(boundary.props);
	if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
	const hydration = (props as Record<string, unknown>).__exactHydration;
	return hydration === 'interaction' || hydration === 'eager' ? hydration : undefined;
}

/** Reads the inert server-rendered operation used by an interaction-activated client island. */
export function clientBoundaryHydrationFallback(
	boundary: ExactServerBoundaryReceiptData
): Child | undefined {
	const props = unwrap(boundary.props);
	if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
	const fallback = (props as Record<string, unknown>).__exactHydrationFallback;
	return fallback as Child | undefined;
}

/** Transforms server boundary children into its required representation. */
export function renderServerBoundaryChildren(
	context: SsrContext,
	boundary: ExactServerBoundaryReceiptData,
	parent: AnyComponentInstance | undefined
): string {
	if (!boundary.children.length) return '';
	const slots = serverBoundarySlotReferences(boundary);
	if (slots) {
		return boundary.children
			.map(
				(child, index) =>
					`${serverSlotOpening(slots[index]!, context)}${renderChildren(context, [child], parent, true)}</span>`
			)
			.join('');
	}
	const slotId = serverSlotId(boundary.id);
	return `<span data-exact-server-slot="${escapeAttr(slotId)}" style="display: contents;">${renderChildren(context, boundary.children, parent, true)}</span>`;
}

/** Reads and validates compiler-owned independent range identities. */
export function serverBoundarySlotIds(
	boundary: ExactServerBoundaryReceiptData
): readonly string[] | undefined {
	return serverBoundarySlotReferences(boundary)?.map((slot) => slot.id);
}

/** Reads and validates compiler-owned independent range authority. */
export function serverBoundarySlotReferences(
	boundary: ExactServerBoundaryReceiptData
): readonly ExactServerSlotReference[] | undefined {
	const props = unwrap(boundary.props);
	if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
	const value = (props as Record<string, unknown>).__exactServerSlots;
	if (value === undefined) return undefined;
	if (
		!Array.isArray(value) ||
		value.length !== boundary.children.length ||
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
	boundary: ExactServerBoundaryReceiptData,
	slots: readonly ExactServerSlotReference[],
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions
): Promise<string> {
	const ranges = await Promise.all(
		boundary.children.map(
			async (child, index) =>
				`${serverSlotOpening(slots[index]!, context)}${await renderChildrenAsync(context, [child], parent, options, true)}</span>`
		)
	);
	return ranges.join('');
}
