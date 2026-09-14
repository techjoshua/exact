import type { Child } from '@exactjs/core';
import type { ExactServerBoundaryReceiptData } from '@exactjs/core/runtime/component-abi';
import { unwrap } from '@exactjs/reactive/framework/values';
import { escapeAttr } from '../html.js';
import { jsonUnsafePath } from '../hydration.js';
import { markerId, markerPair } from '../markup.js';
import type { AnyComponentInstance, RenderToStringOptions, SsrContext } from '../types.js';
import { renderChildren } from './children.js';
import { captureSsrProgramOutput } from './program-capture.js';
import { publishClientBoundary } from './client-boundary-publication.js';
import { clientBoundarySerializationMessage } from './client-boundary-validation.js';
import {
	serverSlotId,
	serverSlotOpening,
	serverSlotPayload,
	serverSlotReference,
	type ExactServerSlotReference
} from './server-slots.js';

/** Transforms server boundary async into its required representation. */
export async function renderServerBoundary(
	context: SsrContext,
	boundary: ExactServerBoundaryReceiptData,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	finite = false
): Promise<string> {
	if (context.writerSink)
		return captureSsrProgramOutput(context, () =>
			renderServerBoundary(context, boundary, parent, options, finite)
		);
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
		? await renderChildren(context, [fallback], parent, options, true)
		: slots
			? await boundedServerRangeChildren(context, boundary, slots, parent, options)
			: boundary.children.length
				? `<span data-exact-server-slot="${escapeAttr(serverSlotId(id))}" style="display: contents;">${await renderChildren(context, boundary.children, parent, options, true)}</span>`
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

async function boundedServerRangeChildren(
	context: SsrContext,
	boundary: ExactServerBoundaryReceiptData,
	slots: readonly ExactServerSlotReference[],
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions
): Promise<string> {
	const ranges = await Promise.all(
		boundary.children.map(
			async (child, index) =>
				`${serverSlotOpening(slots[index]!, context)}${await renderChildren(context, [child], parent, options, true)}</span>`
		)
	);
	return ranges.join('');
}
