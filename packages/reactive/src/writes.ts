import { batch } from './internal/deps.js';

import {
	releaseKeyedCollectionMetadata,
	seedKeyedCollectionMetadata
} from './internal/keyed-collections.js';

import { unwrap } from './internal/values.js';

import { conflictingListKeyError, listKeyExtractors } from './proxy/state.js';

import {
	createReconcilePairs,
	reconcileReactiveValue,
	resolveReactivePath
} from './reconciliation.js';

import type { StopHandle } from './internal/types.js';

/** Compiler-emitted update callback whose source value type is supplied by the authored expression. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Contextual any preserves ordinary arithmetic and property access in generated compound-assignment callbacks.
type ReactiveUpdateOperation<Result> = (previous: any) => Result;

/**
 * Compiler runtime hook for a statically-known state assignment.  Unlike a
 * normal proxy write, plain JSON-shaped replacements are reconciled in place:
 * unchanged branches retain their identity and do not notify dependents.
 * This is deliberately exported for compiler output only.
 */
export function writeReactive(
	target: object,
	path: readonly PropertyKey[],
	next: unknown
): unknown {
	if (!path.length) throw new TypeError('writeReactive requires a state path');
	const { parent, key } = resolveReactivePath(target, path);
	commitReactiveWrite(parent, key, next);
	return next;
}

/** Compiler hook that resolves the assignment reference before evaluating its RHS. */
export function writeReactiveLazy(
	target: object,
	path: readonly PropertyKey[],
	evaluate: () => unknown
): unknown {
	if (!path.length) throw new TypeError('writeReactiveLazy requires a state path');
	const { parent, key } = resolveReactivePath(target, path);
	const next = evaluate();
	commitReactiveWrite(parent, key, next);
	return next;
}

/** Applies a reactive write to the owned runtime state. */
export function commitReactiveWrite(parent: object, key: PropertyKey, next: unknown): void {
	batch(() => {
		const previous = Reflect.get(parent, key);
		if (reconcileReactiveValue(previous, next, createReconcilePairs())) return;
		if (!Object.is(unwrap(previous), unwrap(next))) Reflect.set(parent, key, next);
	});
}

/** Compiler runtime hook for compound assignments and update expressions. */
export function updateReactiveValue(
	target: object,
	path: readonly PropertyKey[],
	operation: ReactiveUpdateOperation<unknown>,
	returnPrevious = false
): unknown {
	const { parent, key } = resolveReactivePath(target, path);
	const previous = Reflect.get(parent, key);
	const next = operation(previous);
	commitReactiveWrite(parent, key, next);
	return returnPrevious ? previous : next;
}

/** Compiler hook for updates whose assignment result differs from the stored value. */
export function updateReactiveValueWithResult(
	target: object,
	path: readonly PropertyKey[],
	operation: ReactiveUpdateOperation<readonly [next: unknown, result: unknown]>
): unknown {
	const { parent, key } = resolveReactivePath(target, path);
	const previous = Reflect.get(parent, key);
	const [next, result] = operation(previous);
	commitReactiveWrite(parent, key, next);
	return result;
}

/** Compiler runtime hook for statically-known deletes. */
export function deleteReactiveValue(target: object, path: readonly PropertyKey[]): boolean {
	if (!path.length) return false;
	const { parent, key } = resolveReactivePath(target, path);
	return Reflect.deleteProperty(parent, key);
}

/** Compiler runtime hook for standard array mutators. */
export function mutateReactiveArray(
	target: object,
	path: readonly PropertyKey[],
	method:
		| 'copyWithin'
		| 'fill'
		| 'pop'
		| 'push'
		| 'reverse'
		| 'shift'
		| 'sort'
		| 'splice'
		| 'unshift',
	args: unknown[] | (() => unknown[])
): unknown {
	const { parent, key } = resolveReactivePath(target, path);
	const value = Reflect.get(parent, key);
	if (!Array.isArray(value))
		throw new TypeError(`Cannot call ${method} on a non-array reactive value`);
	const mutation = value[method] as (...input: unknown[]) => unknown;
	const input = typeof args === 'function' ? args() : args;
	return mutation.apply(value, input);
}

/** Compiler runtime hook for standard Map and Set mutators. */
export function mutateReactiveCollection(
	target: object,
	path: readonly PropertyKey[],
	kind: 'map' | 'set',
	method: 'set' | 'add' | 'delete' | 'clear',
	args: unknown[] | (() => unknown[])
): unknown {
	const { parent, key } = resolveReactivePath(target, path);
	const value = Reflect.get(parent, key);
	if (
		(kind === 'map' && !(unwrap(value) instanceof Map)) ||
		(kind === 'set' && !(unwrap(value) instanceof Set))
	) {
		throw new TypeError(`Cannot call ${method} on a non-${kind} reactive value`);
	}
	const mutation = Reflect.get(value as object, method) as (...input: unknown[]) => unknown;
	const input = typeof args === 'function' ? args() : args;
	return mutation.apply(value, input);
}

/** Records the stable identity used by a keyed list for compiler reconciliation. */
export function registerReactiveListKey(
	collection: Iterable<unknown>,
	key: (item: unknown) => string,
	site = 'an unlabelled this.map() call',
	identity?: string
): StopHandle {
	if (!collection || typeof collection !== 'object') return () => undefined;
	const raw = unwrap(collection as object) as object;
	if (!Array.isArray(raw)) return () => undefined;

	// Render functions are recreated on every component render.  Comparing their
	// source gives compiled call sites a stable identity without retaining a
	// component instance, while still detecting genuinely incompatible keys.
	const signature = identity
		? `compiler:${identity}`
		: `runtime:${Function.prototype.toString.call(key)}`;
	const previous = listKeyExtractors.get(raw);
	if (previous && previous.signature !== signature) {
		throw conflictingListKeyError(previous.site, site);
	}
	// Compiler identities are a checked semantic contract and keep registration
	// constant-time for large lists. Dynamic extractors have only source text as
	// identity, so verify recreated closures against current records to catch
	// captured values that changed their meaning.
	if (previous && !identity) {
		for (const item of raw) {
			if (String(previous.key(item)) !== String(key(item)))
				throw conflictingListKeyError(previous.site, site);
		}
	}
	if (previous) {
		previous.references++;
	} else {
		listKeyExtractors.set(raw, { key, signature, site, references: 1 });
	}
	seedKeyedCollectionMetadata(raw, key);
	let active = true;
	return () => {
		if (!active) return;
		active = false;
		const registration = listKeyExtractors.get(raw);
		if (!registration || registration.signature !== signature) return;
		if (--registration.references === 0) {
			listKeyExtractors.delete(raw);
			releaseKeyedCollectionMetadata(raw);
		}
	};
}
