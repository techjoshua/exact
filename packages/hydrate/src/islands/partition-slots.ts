import { createServerSlot } from '@exactjs/core';
import { isSafeObjectKey } from '../safety.js';
import type { HydrateOptions } from '../types.js';

/** Revives serialized server ranges and invalidates only markers with mismatched authority. */
export function revivePartitionServerSlots(
	value: unknown,
	options: HydrateOptions,
	boundary?: Element
): unknown {
	if (!value || typeof value !== 'object') return value;
	const rootSlot = serverSlot(value, options, boundary);
	if (rootSlot) return rootSlot;
	const root: any = Array.isArray(value) ? new Array(value.length) : {};
	const pending: Array<{ source: any; target: any }> = [{ source: value, target: root }];
	while (pending.length) {
		const { source, target } = pending.pop()!;
		for (const key of Object.keys(source)) {
			if (!Array.isArray(source) && !isSafeObjectKey(key)) continue;
			const child = source[key];
			if (!child || typeof child !== 'object') {
				target[key] = child;
				continue;
			}
			const slot = serverSlot(child, options, boundary);
			if (slot) {
				target[key] = slot;
				continue;
			}
			const revived: any = Array.isArray(child) ? new Array(child.length) : {};
			target[key] = revived;
			pending.push({ source: child, target: revived });
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
		!partitionDiscriminator(discriminator) ||
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

function partitionDiscriminator(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const discriminator = value as Record<string, unknown>;
	if (discriminator.kind === 'single') return Object.keys(discriminator).length === 1;
	if (discriminator.kind === 'branch')
		return (
			Object.keys(discriminator).length === 2 &&
			typeof discriminator.branch === 'string' &&
			!!discriminator.branch
		);
	return (
		discriminator.kind === 'keyed' &&
		Object.keys(discriminator).length === 3 &&
		typeof discriminator.list === 'string' &&
		!!discriminator.list &&
		typeof discriminator.keyToken === 'string' &&
		!!discriminator.keyToken
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
