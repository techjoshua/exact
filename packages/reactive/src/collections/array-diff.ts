import { encodeArraySubmissionValue, decodeReactiveProtocolValue } from '../protocol.js';
import { unwrap } from '../internal/values.js';
import type { ArrayNetMutation, ArrayPart } from './array-patch.js';

/** Independent before/after data with source identities retained only for matching Array occurrences. */
export type ArrayBefore = Readonly<{
	values: unknown[];
	occurrences: readonly unknown[];
	presence: readonly boolean[];
	/** Actual codec-sampled source identities, indexed by serialized occurrence path. */
	nodes: ReadonlyMap<string, unknown>;
}>;
/** Captures a finite after-image in one codec traversal. It is not runtime readonly enforcement. */
export function captureArrayBefore(source: unknown[]): ArrayBefore {
	const nodes = new Map<string, unknown>();
	const occurrences: unknown[] = new Array(source.length),
		presence: boolean[] = new Array(source.length).fill(false);
	const encoded = encodeArraySubmissionValue(source, (value, _encoded, path) => {
		nodes.set(JSON.stringify(path), value);
		if (path.length === 1) {
			const index = Number(path[0]);
			occurrences[index] = unwrap(value);
			presence[index] = true;
		}
	});
	const values = decodeReactiveProtocolValue(encoded.encoded) as unknown[];
	return { values, occurrences, presence, nodes };
}

/** Computes one deterministic net frame. O(n) matching storage, with a complete authorized member scan. */
export function diffArrayCompletion(
	before: ArrayBefore,
	after: ArrayBefore,
	path: string,
	scalarWrites: ReadonlyMap<object, ReadonlyMap<PropertyKey, 'set' | 'delete'>> = new Map()
): readonly ArrayNetMutation[] {
	const positions = new Map<unknown, { indices: number[]; cursor: number }>(),
		negativeZero = Symbol('negative zero'),
		hole = Symbol('hole');
	const key = (value: unknown) => (Object.is(value, -0) ? negativeZero : value);
	for (let i = 0; i < before.values.length; i++) {
		const k = before.presence[i] ? key(before.occurrences[i]) : hole;
		let queue = positions.get(k);
		if (!queue) {
			queue = { indices: [], cursor: 0 };
			positions.set(k, queue);
		}
		queue.indices.push(i);
	}
	const matches: (number | undefined)[] = new Array(after.values.length);
	const rootWrites = scalarWrites.get(after.nodes.get('[]') as object);
	for (let i = 0; i < after.values.length; i++) {
		const queue = positions.get(after.presence[i] ? key(after.occurrences[i]) : hole);
		if (queue && queue.cursor < queue.indices.length) {
			const original = queue.indices[queue.cursor++];
			if (rootWrites?.get(String(i)) !== 'set') matches[i] = original;
		}
	}
	// Nonrecord transportable members have no record field schedule. Publish a changed
	// occurrence as an inserted codec value, retaining unchanged occurrences normally.
	for (let i = 0; i < matches.length; i++) {
		const original = matches[i];
		if (
			original !== undefined &&
			!plain(after.values[i]) &&
			!equal(before.values[original], after.values[i])
		)
			matches[i] = undefined;
	}
	let start = 0;
	while (
		start < before.values.length &&
		start < after.values.length &&
		matches[start] === start &&
		before.presence[start] === after.presence[start]
	)
		start++;
	let suffix = 0;
	while (suffix < before.values.length - start && suffix < after.values.length - start) {
		const a = before.values.length - 1 - suffix,
			b = after.values.length - 1 - suffix;
		if (matches[b] !== a || before.presence[a] !== after.presence[b]) break;
		suffix++;
	}
	for (const key of scalarWrites.get(after.nodes.get('[]') as object)?.keys() ?? []) {
		if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) continue;
		const i = Number(key);
		if (i >= 0xffff_ffff || i >= Math.max(before.values.length, after.values.length)) continue;
		start = Math.min(start, i);
		suffix = Math.min(
			suffix,
			Math.max(0, before.values.length - i - 1),
			Math.max(0, after.values.length - i - 1)
		);
	}
	const changed = start !== before.values.length || start !== after.values.length;
	const parts: ArrayPart[] = [];
	if (changed) {
		let i = start;
		const end = after.values.length - suffix;
		while (i < end) {
			const match = matches[i];
			if (match !== undefined) {
				let count = 1;
				while (i + count < end && matches[i + count] === match + count) count++;
				parts.push({ start: match, count });
				i += count;
			} else {
				const first = i,
					slots: [number, unknown][] = [];
				while (i < end && matches[i] === undefined) {
					if (after.presence[i]) slots.push([i - first, after.values[i]]);
					i++;
				}
				parts.push({ length: i - first, slots });
			}
		}
	}
	const members: ArrayNetMutation['members'][number][] = [];
	for (let i = 0; i < after.values.length; i++) {
		const original = matches[i];
		if (original === undefined || !after.presence[i]) continue;
		const left = before.values[original],
			right = after.values[i];
		if (!plain(left) || !plain(right)) continue;
		const sets: { path: string[]; value: unknown }[] = [],
			deletions: string[][] = [];
		compare(left, right, [], sets, deletions, before, after, original, i, scalarWrites);
		if (sets.length || deletions.length) members.push({ index: original, sets, deletions });
	}
	members.sort((a, b) => a.index - b.index);
	if (!changed && !members.length) return [];
	return [
		{
			operation: 'array-net',
			path,
			beforeLength: before.values.length,
			...(changed
				? { span: { start, deleteCount: before.values.length - start - suffix, parts } }
				: {}),
			members
		}
	];
}

function compare(
	left: Record<string, unknown>,
	right: Record<string, unknown>,
	path: string[],
	sets: { path: string[]; value: unknown }[],
	deletions: string[][],
	before: ArrayBefore,
	after: ArrayBefore,
	beforeIndex: number,
	afterIndex: number,
	scalarWrites: ReadonlyMap<object, ReadonlyMap<PropertyKey, 'set' | 'delete'>>
): void {
	const source = after.nodes.get(JSON.stringify([String(afterIndex), ...path]));
	if (source && typeof source === 'object')
		for (const [key, operation] of scalarWrites.get(source) ?? [])
			if (
				operation === 'delete' &&
				typeof key === 'string' &&
				!Object.hasOwn(left, key) &&
				!Object.hasOwn(right, key)
			)
				deletions.push([...path, key]);
	for (const key of Object.keys(left).sort())
		if (!Object.hasOwn(right, key)) deletions.push([...path, key]);
	for (const key of Object.keys(right).sort()) {
		const next = [...path, key];
		if (!Object.hasOwn(left, key)) {
			sets.push({ path: next, value: right[key] });
			continue;
		}
		const beforePath = JSON.stringify([String(beforeIndex), ...next]),
			afterPath = JSON.stringify([String(afterIndex), ...next]);
		const receiver = after.nodes.get(JSON.stringify([String(afterIndex), ...path]));
		const performed =
			receiver && typeof receiver === 'object' ? scalarWrites.get(receiver)?.get(key) : undefined;
		if (performed === 'set') sets.push({ path: next, value: right[key] });
		else if (plain(left[key]) && plain(right[key])) {
			if (before.nodes.get(beforePath) !== after.nodes.get(afterPath)) {
				if (!equal(left[key], right[key])) sets.push({ path: next, value: right[key] });
			} else
				compare(
					left[key],
					right[key],
					next,
					sets,
					deletions,
					before,
					after,
					beforeIndex,
					afterIndex,
					scalarWrites
				);
		} else if (!equal(left[key], right[key])) sets.push({ path: next, value: right[key] });
	}
}
function plain(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}
/** Equality covers codec-supported nested values, without generating Map or Set operation journals. */
function equal(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++)
			if (Object.hasOwn(a, i) !== Object.hasOwn(b, i) || !equal(a[i], b[i])) return false;
		return true;
	}
	if (a instanceof Map && b instanceof Map) return equal([...a], [...b]);
	if (a instanceof Set && b instanceof Set) return equal([...a], [...b]);
	if (plain(a) && plain(b)) {
		const keys = Object.keys(a);
		return (
			keys.length === Object.keys(b).length &&
			keys.every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]))
		);
	}
	return false;
}
