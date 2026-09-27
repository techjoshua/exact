/** A journaled array slot whose address follows structural edits and their rollback. */
export interface ArrayPosition {
	readonly array: unknown[];
	index: number;
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
	position.index = index;
	positions.get(position.array)!.slots.set(index, position);
}

/** Releases detached ordering records once their owning inverse can no longer run. */
export function releaseArrayPositions(entries: readonly ArrayPosition[]): void {
	for (const position of entries) {
		if (position.index >= 0) continue;
		const order = positions.get(position.array)!.order;
		const index = order.indexOf(position);
		if (index >= 0) order.splice(index, 1);
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
