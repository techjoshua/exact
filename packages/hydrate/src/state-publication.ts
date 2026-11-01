import { unwrap } from '@exactjs/core';
import { publishBatch } from '@exactjs/reactive/framework/runtime';
import { reactive, isReactive } from '@exactjs/reactive';
import { reactiveObjects } from '@exactjs/reactive/framework/objects';
import type {
	ArrayCorrespondence,
	ArrayClientBinding,
	ArrayNetPlan,
	ArrayPlannedField
} from '@exactjs/reactive/framework/array-patch';
import type { ExactContinuationStatePathContract } from '@exactjs/core/framework/component-contracts';
import type { ExactInvocationResult } from './types.js';
import type { StateFieldAddress, StatePublicationFootprint } from './runtime/state-ordering.js';
import { applyPreparedCollectionMutation, mergeStatePublicationForContract } from './state.js';

/** Captured canonical member at exact submission selection, separate from transported read authority. */
export type CapturedStateMembers = ReadonlyMap<
	string,
	Readonly<{ receiver: unknown; ancestors: readonly StateFieldAddress[] }>
>;
/** Prepared scalar assignments and Array completions validated before any live state mutation. */
export type StatePublicationPlan = Readonly<{
	footprint: StatePublicationFootprint;
	output?: { state: unknown };
	apply(): void;
}>;
type PreparedWrite = {
	receiver: object;
	target: object;
	key: string;
	value?: unknown;
	deletion?: true;
	ancestors: readonly StateFieldAddress[];
};
const index = /^(0|[1-9]\d*)$/;

/** Samples only admitted member receiver prefixes. A write-only leaf does not serialize its Array. */
export function captureStateMembers(
	state: object,
	writes: readonly ExactContinuationStatePathContract[],
	sample?: (receiver: object, key: string) => unknown,
	correspondence?: ArrayCorrespondence
): CapturedStateMembers {
	const result = new Map<string, { receiver: unknown; ancestors: StateFieldAddress[] }>();
	const cache = new WeakMap<object, Map<string, unknown>>();
	const read = (source: object, key: string) => {
		let row = cache.get(source);
		if (!row) {
			row = new Map();
			cache.set(source, row);
		}
		if (!row.has(key)) row.set(key, Reflect.get(source, key));
		return row.get(key);
	};
	for (const write of writes)
		for (const root of write.arrayRoots ?? []) {
			const full = write.path.split('.');
			if (full.length <= root.path.length) continue;
			let receiver: unknown = state;
			const ancestors: StateFieldAddress[] = [];
			for (let i = 0; i <= root.path.length; i++) {
				if (!receiver || typeof receiver !== 'object') break;
				const key = full[i]!,
					source = unwrap(receiver);
				if (
					write.arrayRoots?.some(
						(prefix) => prefix.path.length === i && prefix.path.every((part, j) => part === full[j])
					) &&
					!Array.isArray(source)
				)
					break;
				if (!Array.isArray(source)) ancestors.push({ receiver: source, key });
				const prefix = full.slice(0, i + 1),
					encodedPath = JSON.stringify(prefix);
				const capturedAncestor = [...(correspondence?.roots.keys() ?? [])].some((path) =>
					prefix.join('.').startsWith(path + '.')
				);
				receiver =
					capturedAncestor && correspondence!.samples.has(encodedPath)
						? correspondence!.samples.get(encodedPath)
						: (sample ?? read)(source, key);
				if (i === root.path.length)
					result.set(full.slice(0, i + 1).join('.'), {
						receiver,
						ancestors: [...ancestors]
					});
			}
		}
	return result;
}

/** Plans explicit scalar outputs, canonical Array members and structural footprints as one state unit. */
export function prepareStatePublication(
	state: Record<string, unknown>,
	result: ExactInvocationResult,
	writes: readonly ExactContinuationStatePathContract[],
	members: CapturedStateMembers,
	array?: { binding: ArrayClientBinding; correspondence: ArrayCorrespondence }
): StatePublicationPlan | undefined {
	const net = (result.mutations ?? []).filter((m) => m.operation === 'array-net');
	const legacy = (result.mutations ?? []).filter((m) => m.operation !== 'array-net');
	const validation = mergeStatePublicationForContract(
		state,
		{ ...result, mutations: legacy.length ? legacy : undefined },
		{ writes }
	);
	if (validation?.ok === false) throw new TypeError('Unauthorized state publication');
	const planned = new WeakMap<object, Map<string, ArrayPlannedField>>(),
		operations: PreparedWrite[] = [],
		structures: object[] = [],
		structureAncestors: StateFieldAddress[] = [],
		fieldFootprints: { leaf: StateFieldAddress; ancestors: readonly StateFieldAddress[] }[] = [];
	const read = (receiver: object, key: string) => {
		const raw = unwrap(receiver);
		let fields = planned.get(raw);
		if (!fields) {
			fields = new Map();
			planned.set(raw, fields);
		}
		if (!fields.has(key)) fields.set(key, { value: Reflect.get(receiver, key) });
		return fields.get(key)!.value;
	};
	const write = (
		receiver: object,
		key: string,
		value: unknown,
		deletion: boolean,
		ancestors: readonly StateFieldAddress[]
	) => {
		// Indexed state facades own their notifications. Raw identity belongs only to planning/history.
		const target = receiver;
		receiver = unwrap(receiver);
		if (Array.isArray(receiver) && !index.test(key))
			throw new TypeError('Unsupported Array state path');
		const actual = Array.isArray(receiver) && !deletion ? String(Number(key)) : key;
		let fields = planned.get(receiver);
		if (!fields) {
			fields = new Map();
			planned.set(receiver, fields);
		}
		fields.set(actual, { value: deletion ? undefined : value, changed: true });
		operations.push({
			receiver,
			target,
			key: actual,
			...(deletion ? { deletion: true as const } : { value }),
			ancestors
		});
		fieldFootprints.push({ leaf: { receiver, key: actual }, ancestors });
		if (Array.isArray(receiver)) {
			structures.push(receiver);
			structureAncestors.push(...ancestors);
		}
	};
	const locate = (path: string, traversal: 'create' | 'existing' = 'existing') => {
		const segments = path.split('.');
		let receiver: unknown = state,
			offset = 0,
			ancestors: StateFieldAddress[] = [];
		for (let i = segments.length - 1; i > 0; i--) {
			const captured = members.get(segments.slice(0, i).join('.'));
			if (captured?.receiver && typeof captured.receiver === 'object') {
				receiver = captured.receiver;
				offset = i;
				ancestors = [...captured.ancestors];
				break;
			}
		}
		for (let i = offset; i < segments.length - 1; i++) {
			if (!receiver || typeof receiver !== 'object') throw new TypeError('Invalid state receiver');
			const key = segments[i]!;
			if (Array.isArray(receiver) && !index.test(key))
				throw new TypeError('Unsupported Array state path');
			const object = receiver as object;
			const actual = Array.isArray(object) ? String(Number(key)) : key;
			const current = read(object, actual);
			if (!current || typeof current !== 'object') {
				if (traversal === 'existing') return undefined;
				const created = index.test(segments[i + 1]!) ? [] : {};
				write(object, key, created, false, ancestors);
				if (!Array.isArray(object)) ancestors.push({ receiver: unwrap(object), key: actual });
				receiver = created;
			} else {
				if (!Array.isArray(receiver)) ancestors.push({ receiver: unwrap(object), key: actual });
				receiver = current;
			}
		}
		if (!receiver || typeof receiver !== 'object') throw new TypeError('Invalid state receiver');
		return { receiver, key: segments[segments.length - 1]!, ancestors };
	};
	const address = (path: string, value: unknown, deletion: boolean) => {
		const target = locate(path, deletion ? 'existing' : 'create');
		if (!target) return;
		write(target.receiver, target.key, value, deletion, target.ancestors);
	};
	const selected =
		result.statePaths ??
		writes.filter((w) => w.kind === 'write' && w.confidence === 'exact').map((w) => w.path);
	for (const path of selected) {
		if (path === '*') {
			if (result.state && typeof result.state === 'object') {
				for (const key of Object.keys(state))
					if (!Object.hasOwn(result.state, key)) address(key, undefined, true);
				for (const key of Object.keys(result.state))
					address(key, Reflect.get(result.state, key), false);
			}
			continue;
		}
		let value = result.state,
			present = true;
		for (const key of path.split('.')) {
			if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) {
				present = false;
				break;
			}
			value = Reflect.get(value, key);
		}
		if (present) address(path, value, false);
	}
	for (const path of result.deletions ?? []) address(path, undefined, true);
	const collections = legacy.map((mutation) => {
		const target = locate(mutation.path);
		if (!target) throw new TypeError('Invalid collection receiver');
		const receiver = read(target.receiver, target.key);
		if (!receiver || typeof receiver !== 'object')
			throw new TypeError('Invalid collection receiver');
		fieldFootprints.push({
			leaf: { receiver: unwrap(target.receiver), key: target.key },
			ancestors: target.ancestors
		});
		return { receiver, mutation };
	});
	const arrays: ArrayNetPlan[] = [];
	for (const mutation of net) {
		if (!array || mutation.operation !== 'array-net')
			throw new TypeError('Missing Array completion binding');
		const authority = writes.some(
			(w) =>
				w.kind === 'write' &&
				w.confidence === 'exact' &&
				w.path === mutation.path &&
				w.arrayRoots?.some((root) => root.path.join('.') === mutation.path)
		);
		if (!authority) throw new TypeError('Unauthorized Array completion');
		const plan = array.binding.plan(mutation, array.correspondence, { fields: planned });
		arrays.push(plan);
		const target = locate(mutation.path);
		if (!target) throw new TypeError('Invalid Array root receiver');
		const ancestors = [...target.ancestors, { receiver: unwrap(target.receiver), key: target.key }];
		if (
			operations.some((operation) =>
				ancestors.some((edge) => edge.receiver === operation.receiver && edge.key === operation.key)
			)
		)
			throw new TypeError('Conflicting Array replacement and completion');
		if (plan.sequence) {
			structures.push(unwrap(plan.array));
			structureAncestors.push(...ancestors);
		}
		for (const field of plan.writes) {
			fieldFootprints.push({
				leaf: { receiver: unwrap(field.receiver), key: field.key },
				ancestors: [...ancestors, ...field.ancestors]
			});
			if (Array.isArray(field.receiver)) {
				structures.push(unwrap(field.receiver));
				structureAncestors.push(...ancestors);
			}
		}
	}
	if (!operations.length && !arrays.length && !legacy.length && !validation) return undefined;
	return {
		...(validation?.ok ? { output: { state: validation.state } } : {}),
		footprint: {
			fields: fieldFootprints,
			structures,
			structureAncestors,
			...(selected.includes('*') && result.state !== undefined ? { replaceRoot: true } : {})
		},
		apply() {
			publishBatch(() => {
				for (const operation of operations) {
					const receiver = isReactive(operation.target)
						? operation.target
						: operation.target instanceof Map || operation.target instanceof Set
							? reactive(operation.target)
							: reactiveObjects(operation.target);
					if (operation.deletion) {
						if (!Reflect.deleteProperty(receiver, operation.key))
							throw new TypeError('State deletion failed');
					} else if (!Reflect.set(receiver, operation.key, operation.value))
						throw new TypeError('State assignment failed');
				}
				for (const plan of arrays) array!.binding.apply(plan);
				for (const { receiver, mutation } of collections)
					if (!applyPreparedCollectionMutation(reactive(receiver), mutation))
						throw new TypeError('Collection publication failed');
			});
		}
	};
}
