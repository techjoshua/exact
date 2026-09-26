import { isServerSlotDiscriminator } from '@exactjs/core/framework/protocol-records';
import { createServerSlot } from '@exactjs/core/runtime/render-operations';
import { isSafeObjectKey } from '../safety.js';
import type { HydrateOptions } from '../types.js';

type RevivedContainer = unknown[] | Record<string, unknown> | Map<unknown, unknown> | Set<unknown>;

/** Revives serialized server ranges and invalidates only markers with mismatched authority. */
export function revivePartitionServerSlots(
	value: unknown,
	options: HydrateOptions,
	boundary?: Element
): unknown {
	if (!value || typeof value !== 'object') return value;
	const pending: Array<{ source: object; target: RevivedContainer }> = [];
	const revive = (source: unknown): unknown => {
		if (!source || typeof source !== 'object') return source;
		const slot = serverSlot(source, options, boundary);
		if (slot) return slot;
		const target: RevivedContainer =
			source instanceof Map
				? new Map()
				: source instanceof Set
					? new Set()
					: Array.isArray(source)
						? new Array(source.length)
						: {};
		pending.push({ source, target });
		return target;
	};
	const root = revive(value);
	while (pending.length) {
		const { source, target } = pending.pop()!;
		if (source instanceof Map && target instanceof Map) {
			for (const [key, child] of source) target.set(key, revive(child));
		} else if (source instanceof Set && target instanceof Set) {
			for (const child of source) target.add(revive(child));
		} else {
			for (const key of Object.keys(source)) {
				if (!Array.isArray(source) && !isSafeObjectKey(key)) continue;
				Reflect.set(target, key, revive(Reflect.get(source, key)));
			}
		}
	}
	return root;
}

function serverSlot(
	value: object,
	options: HydrateOptions,
	boundary?: Element
): ReturnType<typeof createServerSlot> | undefined {
	const record = value as Record<string, unknown>;
	if (typeof record.__exactServerSlot !== 'string') return undefined;
	const id = record.__exactServerSlot;
	if (record.planVersion === undefined) return createServerSlot(id);
	const discriminator = record.discriminator;
	if (
		record.planVersion !== 1 ||
		typeof record.buildKey !== 'string' ||
		(options.buildKey !== undefined && record.buildKey !== options.buildKey) ||
		record.executionRoot !== (options.executionRoot ?? 'page') ||
		typeof record.ownerComponentId !== 'string' ||
		!record.ownerComponentId ||
		!isServerSlotDiscriminator(discriminator) ||
		(record.planEdgeId !== id &&
			!keyedPartitionSlotIdentity(id, record.planEdgeId, discriminator)) ||
		!Number.isSafeInteger(record.generation) ||
		(record.generation as number) < 1 ||
		!partitionMarkerMatches(boundary, record)
	) {
		clearMismatchedPartitionMarker(boundary, id);
		return createServerSlot(id);
	}
	return createServerSlot(id);
}

function clearMismatchedPartitionMarker(boundary: Element | undefined, id: string): void {
	if (!boundary) return;
	const marker = [...boundary.querySelectorAll('[data-exact-server-slot]')].find(
		(candidate) => candidate.getAttribute('data-exact-server-slot') === id
	);
	if (!marker) return;
	marker.replaceChildren();
	for (const attribute of [...marker.attributes]) {
		if (attribute.name.startsWith('data-exact-partition-')) marker.removeAttribute(attribute.name);
	}
}

function keyedPartitionSlotIdentity(
	id: string,
	planEdgeId: unknown,
	discriminator: unknown
): boolean {
	return (
		typeof planEdgeId === 'string' &&
		!!discriminator &&
		typeof discriminator === 'object' &&
		(discriminator as Record<string, unknown>).kind === 'keyed' &&
		id.startsWith(`${planEdgeId}:key:`)
	);
}

function partitionMarkerMatches(
	boundary: Element | undefined,
	reference: Record<string, unknown>
): boolean {
	if (!boundary) return true;
	const marker = [...boundary.querySelectorAll('[data-exact-server-slot]')].find(
		(candidate) => candidate.getAttribute('data-exact-server-slot') === reference.__exactServerSlot
	);
	return (
		!!marker &&
		marker.getAttribute('data-exact-partition-version') === String(reference.planVersion) &&
		marker.getAttribute('data-exact-partition-build') === reference.buildKey &&
		marker.getAttribute('data-exact-partition-root') === reference.executionRoot &&
		marker.getAttribute('data-exact-partition-edge') === reference.planEdgeId &&
		marker.getAttribute('data-exact-partition-owner') === reference.ownerComponentId &&
		marker.getAttribute('data-exact-partition-discriminator') ===
			(reference.discriminator as Record<string, unknown>).kind &&
		partitionDiscriminatorMarkerMatches(
			marker,
			reference.discriminator as Record<string, unknown>
		) &&
		marker.getAttribute('data-exact-partition-generation') === String(reference.generation)
	);
}

function partitionDiscriminatorMarkerMatches(
	marker: Element,
	discriminator: Record<string, unknown>
): boolean {
	if (discriminator.kind === 'single') return true;
	if (discriminator.kind === 'branch')
		return marker.getAttribute('data-exact-partition-branch') === discriminator.branch;
	return (
		marker.getAttribute('data-exact-partition-list') === discriminator.list &&
		marker.getAttribute('data-exact-partition-key') === discriminator.keyToken
	);
}
