import type { Component, ContextToken } from '@exact/core';
import { reactive, type Reactive } from '@exact/reactive';
import type { DependencyList, ExternalStoreSubscribe, ReactContext } from '../types.js';
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
import { nextReactCompatibilityId, profileStack } from './shared.js';

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

	constructor(protected readonly component: Component<Record<string, unknown>>) {
		const runtime = readReactRootRuntime(component);
		this.id = runtime ? ++runtime.nextComponentId : nextReactCompatibilityId();
		this.identifierPrefix = runtime?.identifierPrefix ?? '';
	}

	exactContext<T>(context: ContextToken<T>): T {
		return this.component.getContext(context);
	}

	protected abstract syncOwnerHooks(): void;

	contextChanged(): boolean {
		return this.committed.some(
			(slot) => slot.kind === 'context' && !Object.is(slot.value, this.readContext(slot.context))
		);
	}

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

	effectEvent<T extends (...args: any[]) => unknown>(implementation: T): T {
		const index = this.nextIndex();
		let slot = this.slot(index);
		if (!slot) {
			const state: EffectEventSlot = {
				kind: 'effect-event',
				implementation,
				callback: (...args: any[]) => state.implementation(...args)
			};
			slot = state;
			this.setSlot(index, slot);
		}
		assertHookKind(slot, 'effect-event', index);
		slot.implementation = implementation;
		return slot.callback as T;
	}

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
			queueMicrotask(() => {
				const committed = this.committed[index];
				if (!committed || committed.kind !== 'deferred' || this.disposed) return;
				committed.scheduled = false;
				if (Object.is(committed.value, committed.input)) return;
				committed.value = committed.input;
				this.invalidate();
			});
		}
		return slot.value;
	}

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
		slot.value = next;
		this.invalidate();
	}

	private updateOptimistic(index: number, action: unknown): void {
		if (this.disposed) return;
		const slot = this.committed[index];
		assertHookKind(slot, 'optimistic', index);
		slot.value = slot.reducer ? slot.reducer(slot.value, action) : action;
		this.invalidate();
	}

	protected invalidate(): void {
		const state = this.component.state;
		state.__reactRevision = Number(state.__reactRevision ?? 0) + 1;
	}
}
