import { publishBatch } from '../internal/deps.js';
import { reactive } from '../reactive.js';
import { unwrap } from '../internal/values.js';
import { reactiveObjects } from '../framework/objects.js';
import {
	encodeArraySubmissionValue,
	decodeReactiveProtocolValue,
	invocationValueError
} from '../protocol.js';

/** A baseline occurrence run or a sparse inserted span. No run consumes an occurrence twice. */
export type ArrayPart =
	| Readonly<{ start: number; count: number }>
	| Readonly<{ length: number; slots: readonly (readonly [number, unknown])[] }>;
/** One compact completion frame, expressed only in submitted baseline coordinates. */
export type ArrayNetMutation = Readonly<{
	operation: 'array-net';
	path: string;
	beforeLength: number;
	span?: Readonly<{ start: number; deleteCount: number; parts: readonly ArrayPart[] }>;
	members: readonly Readonly<{
		index: number;
		sets: readonly Readonly<{ path: readonly string[]; value: unknown }>[];
		deletions: readonly (readonly string[])[];
	}>[];
}>;
/** One already selected source Array and its serialized baseline. Invocation-owned, never global. */
export type ArrayCorrespondence = {
	roots: Map<string, { source: unknown[]; values: unknown[]; occurrences: Map<number, unknown> }>;
	/** Invocation-local identities from the same codec traversal, never a second source read. */
	samples: ReadonlyMap<string, unknown>;
	release(): void;
};
/** Codec-selected input and member-only receiver prefixes sampled by the owning selector. */
export type SelectedArrayRoot = Readonly<{ path: readonly string[] }>;
/** Prepared property operation. Receiver identity is stable through planning and staged apply. */
export type ArrayFieldWrite = Readonly<{
	receiver: object;
	key: string;
	value?: unknown;
	deletion?: true;
	ancestors: readonly Readonly<{ receiver: object; key: string }>[];
}>;
/** Validated complete sequence and field schedule. It owns no mutation until apply. */
export type ArrayNetPlan = Readonly<{
	array: unknown[];
	sequence?: unknown[];
	writes: readonly ArrayFieldWrite[];
}>;
/** Invocation-local planned edge. Changed marks an earlier response operation, never a browser edit. */
export type ArrayPlannedField = { value: unknown; changed?: true };
/** Target-local client capability, absent unless generated Array prefixes require correspondence. */
export type ArrayClientBinding = Readonly<{
	capture: typeof captureArraySubmission;
	parse: typeof parseArrayNetMutation;
	plan: typeof prepareArrayNetMutation;
	apply: typeof applyArrayNetPlan;
}>;
/** Server binding uses erased type references, without retaining the comparison implementation. */
export type ArrayServerBinding = Readonly<{
	capture: typeof import('./array-diff.js').captureArrayBefore;
	diff: typeof import('./array-diff.js').diffArrayCompletion;
	parse: typeof parseArrayNetMutation;
}>;

/**
 * Samples correspondence with the actual codec values. Caller retains it until apply or discard.
 * The request owner handles a transport error after grouping the sampled submission with its batch.
 */
export function captureArraySubmission(
	selected: unknown,
	roots: readonly SelectedArrayRoot[],
	options: { maxDepth?: number } = {}
): {
	encodedState: unknown;
	correspondence: ArrayCorrespondence;
	valueDepth: number;
	transportError?: TypeError;
	release(): void;
} {
	const captured = new Map<
		string,
		{ source: unknown[]; values: unknown[]; occurrences: Map<number, unknown> }
	>();
	const originals = new Map<string, unknown>();
	let transportError: TypeError | undefined;
	const encoded = encodeArraySubmissionValue(
		selected,
		(source, _encoded, path) => {
			originals.set(JSON.stringify(path), source);
			// Finish sampling in source order. The owning request rejects the whole batch.
			transportError ??= invocationValueError(source);
		},
		options
	);
	const decoded: unknown = decodeReactiveProtocolValue(encoded.encoded, options);
	for (const root of roots) {
		const source = unwrap(originals.get(JSON.stringify(root.path)));
		if (!Array.isArray(source)) continue;
		let values = decoded;
		for (const key of root.path)
			values = values && typeof values === 'object' ? Reflect.get(values, key) : undefined;
		// A write-only member prefix has no transport baseline. Its scalar correspondence belongs to the state selector.
		if (!Array.isArray(values)) continue;
		const occurrences = new Map<number, unknown>();
		for (let i = 0; i < values.length; i++) {
			const key = JSON.stringify([...root.path, String(i)]);
			if (originals.has(key)) occurrences.set(i, originals.get(key));
			else if (!Object.hasOwn(values, i)) values[i] = null;
		}
		captured.set(root.path.join('.'), { source, values, occurrences });
	}
	const correspondence: ArrayCorrespondence = {
		roots: captured,
		samples: originals,
		release() {
			captured.clear();
			originals.clear();
		}
	};
	return {
		encodedState: encoded.encoded,
		correspondence,
		valueDepth: encoded.valueDepth,
		transportError,
		release: () => correspondence.release()
	};
}

/** Rejects malformed arithmetic, sparse variants and duplicate baseline consumption before application. */
export function parseArrayNetMutation(
	value: unknown,
	onSequenceSlots?: (slots: number) => void
): ArrayNetMutation {
	const fail = (): never => {
		throw new TypeError('Malformed Array completion patch');
	};
	if (
		!record(value) ||
		!['operation', 'path', 'beforeLength', 'members'].every((key) => Object.hasOwn(value, key)) ||
		!keys(value, ['operation', 'path', 'beforeLength', 'span', 'members']) ||
		value.operation !== 'array-net' ||
		typeof value.path !== 'string' ||
		!safePath(value.path.split('.')) ||
		!integer(value.beforeLength) ||
		value.beforeLength > 0xffff_ffff ||
		!dense(value.members)
	)
		return fail();
	const length = value.beforeLength,
		consumed: { start: number; end: number }[] = [];
	let finalLength = length;
	const consume = (start: number, count: number) => {
		if (!integer(start) || !integer(count) || count === 0 || start > length - count) return fail();
		consumed.push({ start, end: start + count });
	};
	if (value.span !== undefined) {
		const span = value.span;
		if (
			!record(span) ||
			!keys(span, ['start', 'deleteCount', 'parts']) ||
			!integer(span.start) ||
			!integer(span.deleteCount) ||
			span.start > length - span.deleteCount ||
			!dense(span.parts)
		)
			return fail();
		finalLength = span.start;
		if (span.start) consume(0, span.start);
		for (const part of span.parts) {
			if (!record(part)) return fail();
			if (Object.hasOwn(part, 'count')) {
				if (!keys(part, ['start', 'count']) || !integer(part.start) || !integer(part.count))
					return fail();
				consume(part.start, part.count);
				finalLength += part.count;
			} else {
				if (
					!keys(part, ['length', 'slots']) ||
					!integer(part.length) ||
					part.length === 0 ||
					!dense(part.slots)
				)
					return fail();
				let previous = -1;
				for (const slot of part.slots) {
					if (
						!dense(slot) ||
						slot.length !== 2 ||
						!integer(slot[0]) ||
						slot[0] <= previous ||
						slot[0] >= part.length
					)
						return fail();
					previous = slot[0];
				}
				finalLength += part.length;
			}
			if (finalLength > 0xffff_ffff) return fail();
		}
		const suffix = span.start + span.deleteCount;
		if (suffix < length) consume(suffix, length - suffix);
		finalLength += length - suffix;
		if (finalLength > 0xffff_ffff) return fail();
	}
	consumed.sort((a, b) => a.start - b.start);
	for (let i = 1; i < consumed.length; i++)
		if (consumed[i]!.start < consumed[i - 1]!.end) return fail();
	let previous = -1;
	for (const member of value.members) {
		if (
			!record(member) ||
			!keys(member, ['index', 'sets', 'deletions']) ||
			!integer(member.index) ||
			member.index <= previous ||
			member.index >= length ||
			!dense(member.sets) ||
			!dense(member.deletions)
		)
			return fail();
		previous = member.index;
		const paths = new Set<string>();
		for (const set of member.sets) {
			if (
				!record(set) ||
				!keys(set, ['path', 'value']) ||
				!Object.hasOwn(set, 'value') ||
				!safePath(set.path)
			)
				return fail();
			const key = JSON.stringify(set.path);
			if (paths.has(key)) return fail();
			paths.add(key);
		}
		for (const path of member.deletions) {
			if (!safePath(path)) return fail();
			const key = JSON.stringify(path);
			if (paths.has(key)) return fail();
			paths.add(key);
		}
		// Ancestors are allowed across occurrence groups, not ambiguously within one group.
		const ordered = [...paths]
			.map((p) => JSON.parse(p) as string[])
			.sort((a, b) => {
				for (let i = 0; i < Math.min(a.length, b.length); i++) {
					if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
				}
				return a.length - b.length;
			});
		for (let i = 1; i < ordered.length; i++)
			if (prefix(ordered[i - 1]!, ordered[i]!)) return fail();
	}
	if (value.span !== undefined) onSequenceSlots?.(finalLength);
	return value as unknown as ArrayNetMutation;
}

/** Prepares canonical retained references and the deterministic changed-member schedule without live writes. */
export function prepareArrayNetMutation(
	input: ArrayNetMutation,
	correspondence: ArrayCorrespondence,
	scope?: { fields: WeakMap<object, Map<string, ArrayPlannedField>> }
): ArrayNetPlan {
	const patch = parseArrayNetMutation(input),
		root = correspondence.roots.get(patch.path);
	if (!root || root.values.length !== patch.beforeLength)
		throw new TypeError('Array completion baseline unavailable');
	const retained = (index: number) =>
		root.occurrences.has(index) ? root.occurrences.get(index) : root.values[index];
	let sequence: unknown[] | undefined;
	if (patch.span) {
		const span = patch.span;
		sequence = [];
		for (let i = 0; i < span.start; i++) sequence.push(retained(i));
		for (const part of span.parts) {
			if ('count' in part) {
				for (let i = part.start; i < part.start + part.count; i++) sequence.push(retained(i));
			} else {
				const offset = sequence.length;
				sequence.length += part.length;
				for (const [i, value] of part.slots) sequence[offset + i] = value;
			}
		}
		for (let i = span.start + span.deleteCount; i < patch.beforeLength; i++)
			sequence.push(retained(i));
	}
	const writes: ArrayFieldWrite[] = [];
	const planned = scope?.fields ?? new WeakMap<object, Map<string, ArrayPlannedField>>();
	const read = (receiver: object, key: string) => {
		let fields = planned.get(receiver);
		if (!fields) {
			fields = new Map();
			planned.set(receiver, fields);
		}
		if (!fields.has(key)) fields.set(key, { value: Reflect.get(receiver, key) });
		return fields.get(key)!;
	};
	const schedule = (
		receiver: object,
		key: string,
		value: unknown,
		deletion: boolean,
		ancestors: readonly { receiver: object; key: string }[]
	) => {
		if (Array.isArray(receiver) && !/^(0|[1-9]\d*)$/.test(key))
			throw new TypeError('Unsupported Array state path');
		const actual = Array.isArray(receiver) && !deletion ? String(Number(key)) : key;
		let fields = planned.get(receiver);
		if (!fields) {
			fields = new Map();
			planned.set(receiver, fields);
		}
		fields.set(actual, { value: deletion ? undefined : value, changed: true });
		writes.push({
			receiver,
			key: actual,
			ancestors: [...ancestors],
			...(deletion ? { deletion: true as const } : { value })
		});
	};
	const add = (member: number, path: readonly string[], value: unknown, deletion: boolean) => {
		let receiver = retained(member);
		const ancestors: { receiver: object; key: string }[] = [];
		for (let i = 0; i < path.length - 1; i++) {
			if (!receiver || typeof receiver !== 'object')
				throw new TypeError('Invalid Array member receiver');
			const current = unwrap(receiver),
				key = path[i]!;
			if (Array.isArray(current) && !/^(0|[1-9]\d*)$/.test(key))
				throw new TypeError('Unsupported Array state path');
			const actual = Array.isArray(current) ? String(Number(key)) : key;
			const edge = read(current, actual);
			let next = edge.value;
			// Later changed occurrences may restore an edge removed earlier in this same plan.
			// The exact captured object is retained, without restoring a serialized payload.
			if ((!next || typeof next !== 'object') && edge.changed) {
				const original = correspondence.samples.get(
					JSON.stringify([...patch.path.split('.'), String(member), ...path.slice(0, i + 1)])
				);
				if (original && typeof original === 'object') {
					next = unwrap(original);
					schedule(current, key, next, false, ancestors);
				}
			}
			if (!Array.isArray(current)) ancestors.push({ receiver: current, key: actual });
			receiver = next;
		}
		if (!receiver || typeof receiver !== 'object')
			throw new TypeError('Invalid Array member receiver');
		schedule(unwrap(receiver), path[path.length - 1]!, value, deletion, ancestors);
	};
	for (const member of patch.members) {
		for (const set of member.sets) add(member.index, set.path, set.value, false);
		for (const path of member.deletions) add(member.index, path, undefined, true);
	}
	return { array: root.source, ...(sequence ? { sequence } : {}), writes };
}

/** Applies only a prevalidated plan through ordinary reactive receivers. Authored traps may still throw. */
export function applyArrayNetPlan(plan: ArrayNetPlan): void {
	publishBatch(() => {
		for (const write of plan.writes) {
			const receiver =
				write.receiver instanceof Map || write.receiver instanceof Set
					? reactive(write.receiver)
					: reactiveObjects(write.receiver);
			if (write.deletion) {
				if (!Reflect.deleteProperty(receiver, write.key))
					throw new TypeError('Array member deletion failed');
			} else if (!Reflect.set(receiver, write.key, write.value))
				throw new TypeError('Array member assignment failed');
		}
		if (plan.sequence) {
			const array = reactiveObjects(plan.array),
				next = plan.sequence;
			for (let i = 0; i < Math.max(array.length, next.length); i++) {
				if (Object.hasOwn(next, i)) {
					if (!Object.hasOwn(array, i) || !Object.is(unwrap(array[i]), unwrap(next[i])))
						array[i] = next[i];
				} else if (Object.hasOwn(array, i) && !Reflect.deleteProperty(array, String(i)))
					throw new TypeError('Array slot deletion failed');
			}
			array.length = next.length;
		}
	});
}

function record(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
	return Object.keys(value).every((k) => allowed.includes(k));
}
function integer(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}
function dense(value: unknown): value is unknown[] {
	if (!Array.isArray(value)) return false;
	for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) return false;
	return Object.keys(value).length === value.length;
}
function safePath(value: unknown): value is string[] {
	return (
		dense(value) &&
		value.length > 0 &&
		value.every(
			(k) =>
				typeof k === 'string' &&
				k.length > 0 &&
				!['__proto__', 'constructor', 'prototype'].includes(k)
		)
	);
}
function prefix(a: readonly string[], b: readonly string[]): boolean {
	return a.length < b.length && a.every((v, i) => v === b[i]);
}
