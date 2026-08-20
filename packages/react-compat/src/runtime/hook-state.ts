import type { Component, ContextToken } from '@exactjs/core';
import { reactive, scheduleWork, type Reactive } from '@exactjs/reactive';
import type {
	AnyReactCallback,
	DependencyList,
	ExternalStoreSubscribe,
	ReactContext
} from '../types.js';
import { contextToken, readComponentReactContext } from './class-support.js';
import {
	assertHookKind,
	cloneDependencies,
	haveSameDependencies,
	type ContextCell,
	type EffectEventSlot,
	type EffectKind,
	type HookSlot
} from './hook-slots.js';
import { readReactRootRuntime } from './nodes.js';
import {
	currentReactTransitionOwnership,
	nextReactCompatibilityId,
	profileStack,
	withReactTransitionOwnership,
	type ReactTransitionOwnership
} from './shared.js';

/** Tracks the state owned by hook. */
export abstract class HookState {
	protected committed: HookSlot[] = [];
	protected working: HookSlot[] | undefined;
	protected cursor = 0;
	protected rendering = false;
	protected disposed = false;
	protected expectedHooks: number | undefined;
	protected mounted = false;
	protected commitScheduled = false;
	protected passiveScheduled = false;
	protected readonly id: number;
	protected readonly identifierPrefix: string;
	protected readonly providedContexts = new Map<ReactContext<unknown>, Reactive<ContextCell>>();
	protected readonly onProfile = profileStack.at(-1);
	private renderTransition: ReactTransitionOwnership | undefined;
	private releaseRenderTransition: (() => void) | undefined;

	constructor(protected readonly component: Component<Record<string, unknown>>) {
		const runtime = readReactRootRuntime(component);
		this.id = runtime ? ++runtime.nextComponentId : nextReactCompatibilityId();
		this.identifierPrefix = runtime?.identifierPrefix ?? '';
	}

	/** Performs the exact context domain operation for this hook state instance. */
	exactContext<T>(context: ContextToken<T>): T {
		return this.component.getContext(context);
	}

	protected abstract syncOwnerHooks(): void;

	/** Performs the context changed domain operation for this hook state instance. */
	contextChanged(): boolean {
		return this.committed.some(
			(slot) => slot.kind === 'context' && !Object.is(slot.value, this.readContext(slot.context))
		);
	}

	/** Performs the state domain operation for this hook state instance. */
	state(initializer: unknown | (() => unknown)): readonly [unknown, (value: unknown) => void] {
		const index = this.nextIndex();
		let slot = this.slot(index);
		if (!slot) {
			const value =
				typeof initializer === 'function' ? (initializer as () => unknown)() : initializer;
			const dispatch = (action: unknown) => this.updateState(index, action);
			slot = { kind: 'state', value, dispatch };
			this.setSlot(index, slot);
		}
		assertHookKind(slot, 'state', index);
		return [slot.value, slot.dispatch];
	}

	/** Performs the reducer domain operation for this hook state instance. */
	reducer(
		reducer: (state: unknown, action: unknown) => unknown,
		initialArg: unknown,
		initializer?: (value: unknown) => unknown
	): readonly [unknown, (action: unknown) => void] {
		const index = this.nextIndex();
		let slot = this.slot(index);
		if (!slot) {
			const dispatch = (action: unknown) => this.updateReducer(index, action);
			slot = {
				kind: 'reducer',
				value: initializer ? initializer(initialArg) : initialArg,
				reducer,
				dispatch
			};
			this.setSlot(index, slot);
		}
		assertHookKind(slot, 'reducer', index);
		slot.reducer = reducer;
		return [slot.value, slot.dispatch];
	}

	/** Performs the ref domain operation for this hook state instance. */
	ref(initial: unknown): { current: unknown } {
		const index = this.nextIndex();
		let slot = this.slot(index);
		if (!slot) {
			slot = { kind: 'ref', value: { current: initial } };
			this.setSlot(index, slot);
		}
		assertHookKind(slot, 'ref', index);
		return slot.value;
	}

	/** Performs the memo domain operation for this hook state instance. */
	memo(factory: () => unknown, deps: DependencyList | undefined): unknown {
		const index = this.nextIndex();
		let slot = this.slot(index);
		if (!slot) {
			slot = { kind: 'memo', value: factory(), deps };
			this.setSlot(index, slot);
			return slot.value;
		}
		assertHookKind(slot, 'memo', index);
		if (deps === undefined || slot.deps === undefined || !haveSameDependencies(slot.deps, deps)) {
			slot.value = factory();
			slot.deps = deps;
		}
		return slot.value;
	}

	/** Performs the debug domain operation for this hook state instance. */
	debug(value: unknown): void {
		const index = this.nextIndex();
		let slot = this.slot(index);
		if (!slot) {
			slot = { kind: 'debug', value };
			this.setSlot(index, slot);
		}
		assertHookKind(slot, 'debug', index);
		slot.value = value;
	}

	/** Performs the context domain operation for this hook state instance. */
	context<T>(context: ReactContext<T>): T {
		const index = this.nextIndex();
		let slot = this.slot(index);
		const value = this.readContext(context as ReactContext<unknown>);
		if (!slot) {
			slot = { kind: 'context', context: context as ReactContext<unknown>, value };
			this.setSlot(index, slot);
		}
		assertHookKind(slot, 'context', index);
		if (slot.context !== context)
			throw new Error(
				`Hook order changed at slot ${index}: useContext received a different context`
			);
		slot.value = value;
		return value as T;
	}

	/** Performs the provide domain operation for this hook state instance. */
	provide<T>(context: ReactContext<T>, value: T): void {
		if (context._exactContextMode === 'value') {
			this.component.setContext(contextToken(context), value);
			return;
		}
		let cell = this.providedContexts.get(context as ReactContext<unknown>);
		if (!cell) {
			cell = reactive<ContextCell>({ current: value });
			this.providedContexts.set(context as ReactContext<unknown>, cell);
			this.component.setContext(contextToken(context as unknown as ReactContext<unknown>), cell);
			return;
		}
		cell.current = value;
	}

	/** Performs the effect domain operation for this hook state instance. */
	effect(
		effectKind: EffectKind,
		create: () => void | (() => void),
		deps: DependencyList | undefined
	): void {
		const index = this.nextIndex();
		let slot = this.slot(index);
		if (!slot) {
			slot = { kind: 'effect', effectKind, create, deps: cloneDependencies(deps), pending: true };
			this.setSlot(index, slot);
			return;
		}
		assertHookKind(slot, 'effect', index);
		if (slot.effectKind !== effectKind)
			throw new Error(
				`Hook order changed at slot ${index}: expected ${slot.effectKind} effect, received ${effectKind}`
			);
		if (deps === undefined || slot.deps === undefined || !haveSameDependencies(slot.deps, deps)) {
			slot.create = create;
			slot.deps = cloneDependencies(deps);
			slot.pending = true;
		}
	}

	/** Performs the id value domain operation for this hook state instance. */
	idValue(): string {
		const index = this.nextIndex();
		let slot = this.slot(index);
		if (!slot) {
			slot = { kind: 'id', value: `:${this.identifierPrefix}exact-r${this.id}-${index}:` };
			this.setSlot(index, slot);
		}
		assertHookKind(slot, 'id', index);
		return slot.value;
	}

	/** Performs the external store domain operation for this hook state instance. */
	externalStore(subscribe: ExternalStoreSubscribe, getSnapshot: () => unknown): unknown {
		const index = this.nextIndex();
		let slot = this.slot(index);
		const value = getSnapshot();
		if (!slot) {
			slot = { kind: 'external-store', subscribe, getSnapshot, value, pendingSubscription: true };
			this.setSlot(index, slot);
			return value;
		}
		assertHookKind(slot, 'external-store', index);
		if (slot.subscribe !== subscribe || slot.getSnapshot !== getSnapshot) {
			slot.subscribe = subscribe;
			slot.getSnapshot = getSnapshot;
			slot.pendingSubscription = true;
		}
		slot.value = value;
		return value;
	}

	/** Performs the effect event domain operation for this hook state instance. */
	effectEvent<T extends AnyReactCallback>(implementation: T): T {
		const index = this.nextIndex();
		let slot = this.slot(index);
		if (!slot) {
			const state: EffectEventSlot = {
				kind: 'effect-event',
				implementation,
				callback: (...args: Parameters<T>) => state.implementation(...args)
			};
			slot = state;
			this.setSlot(index, slot);
		}
		assertHookKind(slot, 'effect-event', index);
		slot.implementation = implementation;
		return slot.callback as T;
	}

	/** Performs the deferred domain operation for this hook state instance. */
	deferred(value: unknown, initialValue: unknown, hasInitialValue: boolean): unknown {
		const index = this.nextIndex();
		let slot = this.slot(index);
		if (!slot) {
			slot = {
				kind: 'deferred',
				value: hasInitialValue ? initialValue : value,
				input: value,
				scheduled: false
			};
			this.setSlot(index, slot);
		}
		assertHookKind(slot, 'deferred', index);
		slot.input = value;
		if (!Object.is(slot.value, value) && !slot.scheduled) {
			slot.scheduled = true;
			scheduleWork(() => {
				const committed = this.committed[index];
				if (!committed || committed.kind !== 'deferred' || this.disposed) return;
				committed.scheduled = false;
				if (Object.is(committed.value, committed.input)) return;
				committed.value = committed.input;
				this.invalidate();
			}, 'deferred');
		}
		return slot.value;
	}

	/** Performs the optimistic domain operation for this hook state instance. */
	optimistic(
		base: unknown,
		reducer?: (state: unknown, action: unknown) => unknown
	): readonly [unknown, (action: unknown) => void] {
		const index = this.nextIndex();
		let slot = this.slot(index);
		if (!slot) {
			const dispatch = (action: unknown) => this.updateOptimistic(index, action);
			slot = { kind: 'optimistic', base, value: base, reducer, dispatch };
			this.setSlot(index, slot);
		}
		assertHookKind(slot, 'optimistic', index);
		if (!Object.is(slot.base, base)) {
			slot.base = base;
			slot.value = base;
		}
		slot.reducer = reducer;
		return [slot.value, slot.dispatch];
	}

	/** Performs the memo cache domain operation for this hook state instance. */
	memoCache(size: number): unknown[] {
		const index = this.nextIndex();
		let slot = this.slot(index);
		if (!slot) {
			slot = {
				kind: 'memo-cache',
				value: Array(size).fill(Symbol.for('react.memo_cache_sentinel'))
			};
			this.setSlot(index, slot);
		}
		assertHookKind(slot, 'memo-cache', index);
		if (slot.value.length !== size)
			throw new Error(`React compiler memo cache changed size at slot ${index}`);
		return slot.value;
	}

	/** Performs the usable context domain operation for this hook state instance. */
	usableContext<T>(context: ReactContext<T>): T {
		return this.readContext(context as ReactContext<unknown>) as T;
	}

	private readContext(context: ReactContext<unknown>): unknown {
		try {
			return readComponentReactContext(this.component, context);
		} catch {
			return context._defaultValue;
		}
	}

	private nextIndex(): number {
		if (!this.rendering || !this.working)
			throw new Error('Hooks can only be called while rendering a React compatibility component');
		return this.cursor++;
	}

	private slot(index: number): HookSlot | undefined {
		return this.working?.[index];
	}
	private setSlot(index: number, slot: HookSlot): void {
		this.working![index] = slot;
		this.syncOwnerHooks();
	}

	private updateState(index: number, action: unknown): void {
		if (this.disposed) return;
		if (this.rendering)
			throw new Error(
				'Updating React state during render is not supported in compatibility Phase 1'
			);
		const slot = this.committed[index];
		assertHookKind(slot, 'state', index);
		const next =
			typeof action === 'function' ? (action as (value: unknown) => unknown)(slot.value) : action;
		if (Object.is(next, slot.value)) return;
		this.captureTransition();
		slot.value = next;
		this.invalidate();
	}

	private updateReducer(index: number, action: unknown): void {
		if (this.disposed) return;
		if (this.rendering)
			throw new Error(
				'Dispatching React state during render is not supported in compatibility Phase 1'
			);
		const slot = this.committed[index];
		assertHookKind(slot, 'reducer', index);
		const next = slot.reducer(slot.value, action);
		this.captureTransition();
		slot.value = next;
		this.invalidate();
	}

	private updateOptimistic(index: number, action: unknown): void {
		if (this.disposed) return;
		const slot = this.committed[index];
		assertHookKind(slot, 'optimistic', index);
		this.captureTransition();
		slot.value = slot.reducer ? slot.reducer(slot.value, action) : action;
		this.invalidate();
	}

	protected invalidate(): void {
		const state = this.component.state;
		state.__reactRevision = Number(state.__reactRevision ?? 0) + 1;
	}

	/** Runs conversion or rendering with the transition captured by the pending update. */
	withRenderTransition<T>(work: () => T): T {
		return withReactTransitionOwnership(this.renderTransition, work);
	}

	/** Releases the update's transition hold after its DOM render has committed. */
	finishTransitionRender(): void {
		this.releaseRenderTransition?.();
		this.releaseRenderTransition = undefined;
		this.renderTransition = undefined;
	}

	/** Releases a superseded transition and retains the transition owning the current update. */
	private captureTransition(): void {
		const transition = currentReactTransitionOwnership();
		if (!transition || transition === this.renderTransition) return;
		this.releaseRenderTransition?.();
		this.renderTransition = transition;
		this.releaseRenderTransition = transition.retain();
	}
}
