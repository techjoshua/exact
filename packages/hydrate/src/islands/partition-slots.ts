import { consumeDomWork, type DomWorkBudget } from '@exactjs/dom/framework/component-root';
import { isServerSlotDiscriminator } from '@exactjs/core/framework/protocol-records';
import { createServerSlot } from '@exactjs/core/runtime/render-operations';
import { isSafeObjectKey } from '../safety.js';
import type { HydrateOptions } from '../types.js';

/** One receiving payload owns only ranges reached through its validated opaque references. */
export type RevivedPartitionProps = {
	readonly props: Record<string, unknown>;
	readonly serverSlots: readonly Element[];
};

type RevivedContainer = unknown[] | Record<string, unknown> | Map<unknown, unknown> | Set<unknown>;

/** Revives serialized server ranges and invalidates only markers with mismatched authority. */
export function revivePartitionServerSlots(
	value: Record<string, unknown>,
	options: HydrateOptions,
	boundary?: Element
): RevivedPartitionProps {
	const pending: Array<{ source: object; target: RevivedContainer }> = [];
	const elements: Element[] = [];
	const markers = partitionMarkers(boundary);
	const rejected = new Set<Element>();
	const revive = (source: unknown): unknown => {
		if (!source || typeof source !== 'object') return source;
		const slot = serverSlot(source, options, elements, markers, rejected, boundary);
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
	// Authority is checked against the same unchanged DOM for the entire prop graph.
	// Rejection completes before any original marker can acquire recovery ownership.
	for (const marker of rejected) clearMismatchedPartitionMarker(marker);
	const surviving = partitionMarkers(boundary);
	return {
		props: root as Record<string, unknown>,
		serverSlots: elements.filter((element) => {
			const current = surviving.get(element.getAttribute('data-exact-server-slot')!);
			return current?.length === 1 && current[0] === element;
		})
	};
}

function serverSlot(
	value: object,
	options: HydrateOptions,
	elements: Element[],
	markers: ReadonlyMap<string, readonly Element[]>,
	rejected: Set<Element>,
	boundary?: Element
): ReturnType<typeof createServerSlot> | undefined {
	const record = value as Record<string, unknown>;
	if (typeof record.__exactServerSlot !== 'string') return undefined;
	const id = record.__exactServerSlot;
	if (record.planVersion === undefined) return retainedSlot(id, markers, elements);
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
		const marker = markers.get(id)?.[0];
		if (marker) rejected.add(marker);
		return createServerSlot(id);
	}
	return retainedSlot(id, markers, elements);
}

/** Retains authority-checked DOM with the decoded opaque reference, never with its authored ID alone. */
function retainedSlot(
	id: string,
	markers: ReadonlyMap<string, readonly Element[]>,
	elements: Element[]
): ReturnType<typeof createServerSlot> {
	const receipt = createServerSlot(id);
	const marker = markers.get(id);
	if (marker?.length === 1) elements.push(marker[0]!);
	return receipt;
}

/** Selects each outermost validated range once without duplicating its server-owned descendants. */
export function retainedServerSlotElements(
	slots: readonly Element[],
	budget: DomWorkBudget
): Element[] {
	const elements = new Set(slots);
	// An outer retained range already carries every nested range in its server-owned content.
	return [...elements].filter((element) => {
		for (let parent = element.parentElement; parent; parent = parent.parentElement) {
			consumeDomWork(budget);
			if (elements.has(parent)) return false;
		}
		return true;
	});
}

/** Indexes scoped marker identity without granting duplicated IDs recovery ownership. */
function partitionMarkers(boundary: Element | undefined): Map<string, Element[]> {
	const markers = new Map<string, Element[]>();
	for (const marker of boundary?.querySelectorAll('[data-exact-server-slot]') ?? []) {
		const id = marker.getAttribute('data-exact-server-slot')!;
		const matches = markers.get(id);
		if (matches) matches.push(marker);
		else markers.set(id, [marker]);
	}
	return markers;
}

/** Applies an already classified rejection, including to nested targets detached by another rejection. */
function clearMismatchedPartitionMarker(marker: Element): void {
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
