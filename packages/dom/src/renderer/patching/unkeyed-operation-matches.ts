import type { Child } from '@exactjs/core';
import type { Mounted } from '../../types.js';
import type { MixedChildOperation } from './mixed-child-operations.js';

/** One old sibling range and its position in the current ownership list. */
export type SiblingMatch = { mounted: Mounted; index: number };

/**
 * Reserves unchanged opaque handles that occur once in each unkeyed list before positional fallback
 * can consume their ranges. Keys remain authoritative and ambiguous handles keep positional policy.
 * Aligned and single-position selections need no index. The caller's scalar fast path never enters this owner.
 */
export function reserveUnkeyedOperationMatches(
	old: readonly SiblingMatch[],
	next: readonly MixedChildOperation[],
	matches: Array<SiblingMatch | undefined>
): Set<Mounted> | undefined {
	if (old.length === 0) return undefined;
	let position = 0;
	let misaligned = false;
	for (const operation of next) {
		if (operation.key !== undefined) continue;
		if (operation.native && !Object.is(old[position]?.mounted.operation, operation.value))
			misaligned = true;
		position++;
	}
	if (!misaligned || (old.length === 1 && position === 1)) return undefined;

	// Only already-classified native inputs can claim an entry, so old values need no new inspection.
	const candidates = new Map<Child, { match: SiblingMatch | undefined; next: number }>();
	for (const entry of old) {
		const value = entry.mounted.operation;
		const candidate = candidates.get(value);
		if (candidate) candidate.match = undefined;
		else candidates.set(value, { match: entry, next: -1 });
	}
	for (let index = 0; index < next.length; index++) {
		const operation = next[index]!;
		if (!operation.native || operation.key !== undefined) continue;
		const candidate = candidates.get(operation.value);
		if (candidate?.match) candidate.next = candidate.next === -1 ? index : -2;
	}
	let reserved: Set<Mounted> | undefined;
	for (const candidate of candidates.values()) {
		if (!candidate.match || candidate.next < 0) continue;
		matches[candidate.next] = candidate.match;
		(reserved ??= new Set()).add(candidate.match.mounted);
	}
	return reserved;
}
