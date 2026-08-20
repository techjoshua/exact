import type {
	AnyReactCallback,
	DependencyList,
	ExternalStoreSubscribe,
	ReactContext
} from '../types.js';

/** Defines the state slot type contract. */
export type StateSlot = { kind: 'state'; value: unknown; dispatch: (value: unknown) => void };
/** Defines the reducer slot type contract. */
export type ReducerSlot = {
	kind: 'reducer';
	value: unknown;
	reducer: (state: unknown, action: unknown) => unknown;
	dispatch: (action: unknown) => void;
};
/** Defines the ref slot type contract. */
export type RefSlot = { kind: 'ref'; value: { current: unknown } };
/** Defines the memo slot type contract. */
export type MemoSlot = { kind: 'memo'; value: unknown; deps: DependencyList | undefined };
/** Defines the debug slot type contract. */
export type DebugSlot = { kind: 'debug'; value: unknown };
/** Defines the context slot type contract. */
export type ContextSlot = { kind: 'context'; context: ReactContext<unknown>; value: unknown };
/** Defines the effect kind type contract. */
export type EffectKind = 'insertion' | 'layout' | 'passive';
/** Defines the effect slot type contract. */
export type EffectSlot = {
	kind: 'effect';
	effectKind: EffectKind;
	create: () => void | (() => void);
	deps: DependencyList | undefined;
	cleanup?: () => void;
	pending: boolean;
};
/** Defines the id slot type contract. */
export type IdSlot = { kind: 'id'; value: string };
/** Defines the external store slot type contract. */
export type ExternalStoreSlot = {
	kind: 'external-store';
	subscribe: ExternalStoreSubscribe;
	getSnapshot: () => unknown;
	value: unknown;
	unsubscribe?: () => void;
	pendingSubscription: boolean;
};
/** Defines the effect event slot type contract. */
export type EffectEventSlot = {
	kind: 'effect-event';
	implementation: AnyReactCallback;
	callback: AnyReactCallback;
};
/** Defines the deferred slot type contract. */
export type DeferredSlot = { kind: 'deferred'; value: unknown; input: unknown; scheduled: boolean };
/** Defines the optimistic slot type contract. */
export type OptimisticSlot = {
	kind: 'optimistic';
	base: unknown;
	value: unknown;
	reducer?: (state: unknown, action: unknown) => unknown;
	dispatch: (action: unknown) => void;
};
/** Defines the memo cache slot type contract. */
export type MemoCacheSlot = { kind: 'memo-cache'; value: unknown[] };

/** A committed or in-progress entry in a component's positional hook list. */
export type HookSlot =
	| StateSlot
	| ReducerSlot
	| RefSlot
	| MemoSlot
	| DebugSlot
	| ContextSlot
	| EffectSlot
	| IdSlot
	| ExternalStoreSlot
	| EffectEventSlot
	| DeferredSlot
	| OptimisticSlot
	| MemoCacheSlot;

/** Mutable cell used to bridge React context through eXact's reactive context. */
export type ContextCell = { current: unknown };

/**
 * Copies the mutable portion of a hook slot before a render transaction.
 * Stable identities such as refs, dispatchers, and callbacks intentionally remain shared.
 */
export function cloneHookSlot(slot: HookSlot): HookSlot {
	if (slot.kind === 'state') return { ...slot };
	if (slot.kind === 'reducer') return { ...slot };
	if (slot.kind === 'memo') return { ...slot, deps: cloneDependencies(slot.deps) };
	if (slot.kind === 'debug') return { ...slot };
	if (slot.kind === 'effect') return { ...slot, deps: cloneDependencies(slot.deps) };
	if (slot.kind === 'context') return { ...slot };
	if (slot.kind === 'deferred') return { ...slot };
	if (slot.kind === 'optimistic') return { ...slot };
	return slot;
}

/** Narrows a positional hook slot and reports hook-order changes consistently. */
export function assertHookKind<K extends HookSlot['kind']>(
	slot: HookSlot | undefined,
	kind: K,
	index: number
): asserts slot is Extract<HookSlot, { kind: K }> {
	if (!slot || slot.kind !== kind) {
		throw new Error(
			`Hook order changed at slot ${index}: expected ${kind}, received ${slot?.kind ?? 'none'}`
		);
	}
}

/** Compares dependency lists using React's Object.is semantics. */
export function haveSameDependencies(previous: DependencyList, next: DependencyList): boolean {
	return (
		previous.length === next.length &&
		previous.every((value, index) => Object.is(value, next[index]))
	);
}

/** Takes an ownership-safe snapshot of a hook dependency list. */
export function cloneDependencies(deps: DependencyList | undefined): DependencyList | undefined {
	return deps === undefined ? undefined : [...deps];
}

/** Runs and clears an effect cleanup so it cannot be invoked twice. */
export function runEffectCleanup(slot: EffectSlot): void {
	const cleanup = slot.cleanup;
	slot.cleanup = undefined;
	cleanup?.();
}
