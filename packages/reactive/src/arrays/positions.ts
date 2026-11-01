/** A journaled array slot whose address follows structural edits and their rollback. */
export interface ArrayPosition {
	readonly array: unknown[];
	index: number;
	/** Refuses this original inverse address after its positional identity becomes uncertain. */
	uncertain?: true;
}
interface ArrayPositions {
	slots: Map<number, ArrayPosition>;
	order: ArrayPosition[];
}
const positions = new WeakMap<unknown[], ArrayPositions>();
const leases = new WeakMap<unknown[], number>();
const addresses = new WeakSet<object>();
/** Mutation ownership key on a retained array position, separate from numeric DOM dependencies. */
export const arrayPositionKey = Symbol('array-position');

/** Recognizes array indices while excluding numeric-looking ordinary properties. */
export function arrayIndex(key: PropertyKey): number | undefined {
	if (typeof key === 'symbol' || key === '') return undefined;
	const index = Number(key);
	return Number.isInteger(index) &&
		index >= 0 &&
		index < 0xffff_ffff &&
		String(index) === String(key)
		? index
		: undefined;
}

/** Reports whether structural operations must preserve addresses retained by earlier journals. */
export function hasArrayPositions(array: unknown[]): boolean {
	return positions.has(array);
}

/** Gets a stable rollback address, allocating only when an inverse journal needs it. */
export function arrayPosition(
	array: unknown[],
	index: number,
	retain: boolean
): ArrayPosition | undefined {
	let state = positions.get(array);
	if (!state && retain) positions.set(array, (state = { slots: new Map(), order: [] }));
	let position = state?.slots.get(index);
	if (!position && retain) {
		position = { array, index };
		state!.slots.set(index, position);
		const last = state!.order.at(-1);
		const next =
			last && last.index >= 0 && last.index < index
				? -1
				: state!.order.findIndex((slot) => slot.index >= index);
		state!.order.splice(next < 0 ? state!.order.length : next, 0, position);
		addresses.add(position);
	}
	return position;
}

/** Distinguishes internal slot addresses from ordinary reactive objects. */
export function isArrayPosition(target: object): target is ArrayPosition {
	return addresses.has(target);
}

/** Detaches removed positions and moves surviving addresses with their entries. */
export function removeArrayPositions(array: unknown[], start: number, count: number): void {
	const state = positions.get(array);
	if (!state) return;
	for (const [index, position] of [...state.slots].sort((left, right) => left[0] - right[0])) {
		if (index < start) continue;
		state.slots.delete(index);
		if (index < start + count) position.index = -1;
		else {
			position.index -= count;
			state.slots.set(position.index, position);
		}
	}
}

/** Opens space for inserted entries without taking ownership of surviving slots. */
export function insertArrayPositions(array: unknown[], start: number, count: number): void {
	const state = positions.get(array);
	if (!state) return;
	for (const [index, position] of [...state.slots].sort((left, right) => right[0] - left[0])) {
		if (index < start) continue;
		state.slots.delete(index);
		position.index += count;
		state.slots.set(position.index, position);
	}
}

/** Finds a removed entry's insertion point relative to surviving original neighbors. */
export function arrayRestorationIndex(position: ArrayPosition): number {
	const state = positions.get(position.array)!;
	const rank = state.order.indexOf(position);
	for (let index = rank + 1; index < state.order.length; index++) {
		const next = state.order[index]!;
		if (next.index >= 0) return next.index;
	}
	return position.array.length;
}

/** Reattaches a removed entry at its restored live index. */
export function restoreArrayPosition(position: ArrayPosition, index: number): void {
	const state = positions.get(position.array)!;
	const previous = state.slots.get(index);
	// Restoring into a hole replaces its address. It cannot remain a second live ordering anchor.
	if (previous && previous !== position) previous.index = -1;
	position.index = index;
	state.slots.set(index, position);
}

/** Releases detached records in one pass per affected array when their inverse can no longer run. */
export function releaseArrayPositions(entries: readonly ArrayPosition[]): void {
	const retired = new Set(entries.filter((position) => position.index < 0));
	for (const array of new Set(Array.from(retired, (position) => position.array))) {
		const state = positions.get(array)!;
		state.order = state.order.filter((position) => !retired.has(position));
	}
}

/** Establishes missing original slots once before sequence edits can detach their neighbors. */
export function prepareArrayPositions(array: unknown[]): void {
	if ((positions.get(array)?.slots.size ?? 0) >= array.length) return;
	for (let index = 0; index < array.length; index++) arrayPosition(array, index, true);
}

/** Keeps array addresses only while a rollback-capable transaction can still refer to them. */
export function retainArrayTracking(array: unknown[]): () => void {
	leases.set(array, (leases.get(array) ?? 0) + 1);
	return () => {
		const remaining = leases.get(array)! - 1;
		if (remaining) leases.set(array, remaining);
		else {
			leases.delete(array);
			positions.delete(array);
		}
	};
}

/** Moves live entries without replacing their rollback addresses, retaining deleted neighbor anchors. */
export function moveArrayPositions(
	entries: readonly ArrayPosition[],
	indices: readonly number[]
): void {
	if (!entries.length) return;
	const state = positions.get(entries[0]!.array)!;
	const anchors = new Map<ArrayPosition | undefined, ArrayPosition[]>();
	let pending: ArrayPosition[] = [];
	for (const position of state.order) {
		if (position.index < 0) pending.push(position);
		else if (pending.length) {
			anchors.set(position, pending);
			pending = [];
		}
	}
	anchors.set(undefined, pending);
	for (const position of entries) state.slots.delete(position.index);
	entries.forEach((position, index) => {
		position.index = indices[index]!;
		state.slots.set(position.index, position);
	});
	state.order = [...state.slots.values()]
		.sort((left, right) => left.index - right.index)
		.flatMap((position) => [...(anchors.get(position) ?? []), position]);
	for (const position of anchors.get(undefined) ?? []) state.order.push(position);
}

/** Retains new native array slots only while an earlier inverse owns structural addresses. */
export function retainArrayPropertyPositions(
	array: unknown[],
	key: PropertyKey,
	previousLength: number,
	geometry?: ArrayLengthGeometry
): readonly ArrayPositionSlot[] {
	if (!positions.has(array)) return [];
	const length = geometry?.length ?? array.length;
	if (geometry && !geometry.stable) {
		refuseArrayPositions(geometry.slots.map((slot) => slot.position));
		return geometry.slots;
	}
	const removed: ArrayPositionSlot[] = [];
	if (key === 'length' && length < previousLength) {
		const state = positions.get(array)!;
		for (const slot of geometry?.slots ?? []) {
			if (slot.index < length || state.slots.get(slot.index) !== slot.position) continue;
			state.slots.delete(slot.index);
			slot.position.index = -1;
			removed.push(slot);
		}
	}
	// One leading hole anchors a sparse extension without allocating every empty slot.
	if (length > previousLength) arrayPosition(array, previousLength, true);
	const index = arrayIndex(key);
	if (index !== undefined && index < length) arrayPosition(array, index, true);
	return removed;
}

/** Borrows exact live slot addresses without resolving them again after authored length acquisition. */
export type ArrayPositionSlot = { readonly position: ArrayPosition; readonly index: number };

/** Carries caller-owned postwrite extent acquisition and its existing monotonic authority check. */
export type ArrayLengthGeometry = {
	readonly length: number;
	readonly stable: boolean;
	readonly slots: readonly ArrayPositionSlot[];
};

/** Captures established slots inside the old physical extent, including retained hole anchors. */
export function arrayPositionSlots(array: unknown[], length: number): readonly ArrayPositionSlot[] {
	return [...(positions.get(array)?.slots ?? [])]
		.filter(([index]) => index < length)
		.map(([index, position]) => ({ index, position }));
}

/** Keeps a detached original distinct from an address whose inverse identity cannot be certified. */
export function isUsableArrayPosition(position: ArrayPosition): boolean {
	return position.uncertain !== true;
}

/** Refuses captured original addresses without touching fresh slots, other targets or lease counts. */
export function refuseArrayPositions(entries: readonly ArrayPosition[]): void {
	for (const position of entries) {
		const state = positions.get(position.array);
		if (state?.slots.get(position.index) === position) state.slots.delete(position.index);
		position.uncertain = true;
		position.index = -1;
	}
}

/** Admits only the exact empty tracked sequence whose original addresses are still detached. */
export function canRestoreClearedPositions(entries: readonly ArrayPosition[]): boolean {
	const state = entries.length ? positions.get(entries[0]!.array) : undefined;
	return (
		!!state &&
		state.slots.size === 0 &&
		state.order.length === entries.length &&
		entries.every(
			(entry, index) =>
				entry.index === -1 && isUsableArrayPosition(entry) && state.order[index] === entry
		)
	);
}

/** Retains an already established numeric authority address without inventing a replacement on replay. */
export function arrayPropertyAddress(
	array: unknown[],
	key: PropertyKey
): { target: object; key: PropertyKey } {
	const index = arrayIndex(key);
	const position = index === undefined ? undefined : arrayPosition(array, index, false);
	return position ? { target: position, key: arrayPositionKey } : { target: array, key };
}
