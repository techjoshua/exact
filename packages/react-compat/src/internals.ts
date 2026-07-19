import {
	ErrorContext,
	Fragment as ExactFragment,
	SuspensionContext,
	createErrorContext,
	createErrorReport,
	createContext as createExactContext,
	createPortal,
	createVNode,
	handleComponentError,
	isVNode,
	trackComponentAsync,
	type Child,
	type Component,
	type ComponentFunction,
	type ComponentInstance,
	type ContextToken,
	type ErrorReport,
	type RefBinding,
	type VNode
} from '@exact/core';
import type { ExactProfileEvent, ExactProfileSink } from '@exact/instrumentation';
import { reactive, unwrap, type Reactive } from '@exact/reactive';
import {
	assertHookKind,
	cloneDependencies,
	cloneHookSlot,
	haveSameDependencies,
	runEffectCleanup,
	type ContextCell,
	type EffectEventSlot,
	type EffectKind,
	type HookSlot
} from './runtime/hook-slots.js';
import type {
	DependencyList,
	ExternalStoreSubscribe,
	ReactClassInstance,
	ReactClassType,
	ReactComponentType,
	ReactContext,
	ReactElement,
	ReactNode,
	ReactRef,
	ReactSpecialType
} from './types.js';

export const REACT_ELEMENT_18 = Symbol.for('react.element');
export const REACT_ELEMENT_19 = Symbol.for('react.transitional.element');
export const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
export const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
export const REACT_MEMO_TYPE = Symbol.for('react.memo');
export const REACT_LAZY_TYPE = Symbol.for('react.lazy');
export const REACT_CONTEXT_TYPE = Symbol.for('react.context');
export const REACT_PROVIDER_TYPE = Symbol.for('react.provider');
export const REACT_CONSUMER_TYPE = Symbol.for('react.consumer');
export const REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode');
export const REACT_PROFILER_TYPE = Symbol.for('react.profiler');
export const REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
export const REACT_PORTAL_TYPE = Symbol.for('react.portal');
export const REACT_ACTIVITY_TYPE = Symbol.for('react.activity');
export const REACT_CLASS_UPDATER = Symbol.for('exact.react.class-updater');
export const EXACT_COMPONENT_TYPE = Symbol.for('exact.react.native-component');

const REACT_REF_PROP = '__exactReactCompatibilityRef';

let target: 18 | 19 = 19;

export type ReactCompatibilityProfileEvent = ExactProfileEvent<'react-compat', 'render' | 'commit'>;
const profileStack: ExactProfileSink<ReactCompatibilityProfileEvent>[] = [];

/** Runs React compatibility component creation with an explicitly scoped profiler. */
export function withReactProfile<T>(
	sink: ExactProfileSink<ReactCompatibilityProfileEvent>,
	run: () => T
): T {
	profileStack.push(sink);
	try {
		return run();
	} finally {
		profileStack.pop();
	}
}

export function setReactCompatibilityTarget(next: 18 | 19): void {
	target = next;
}
export function reactCompatibilityTarget(): 18 | 19 {
	return target;
}
export function reactElementSymbol(): symbol {
	return target === 18 ? REACT_ELEMENT_18 : REACT_ELEMENT_19;
}

export function isReactElement(value: unknown): value is ReactElement {
	if (!value || typeof value !== 'object') return false;
	const marker = (value as { $$typeof?: unknown }).$$typeof;
	return marker === REACT_ELEMENT_18 || marker === REACT_ELEMENT_19;
}

export function createReactContext<T>(defaultValue: T): ReactContext<T> {
	const token = createExactContext<ContextCell>(`react.compat.${nextHookHostId}`);
	return createReactContextObject(defaultValue, token, 'cell');
}

export function createReactContextForExactToken<T>(
	defaultValue: T,
	token: ContextToken<T>
): ReactContext<T> {
	return createReactContextObject(defaultValue, token, 'value');
}

function createReactContextObject<T>(
	defaultValue: T,
	token: ContextToken<unknown>,
	mode: 'cell' | 'value'
): ReactContext<T> {
	const context: Record<string, unknown> = {
		$$typeof: REACT_CONTEXT_TYPE,
		_currentValue: defaultValue,
		_currentValue2: defaultValue,
		_threadCount: 0,
		_currentRenderer: null,
		_currentRenderer2: null,
		_defaultValue: defaultValue,
		_exactToken: token,
		_exactContextMode: mode
	};
	context.Provider = target === 19 ? context : { $$typeof: REACT_PROVIDER_TYPE, _context: context };
	context.Consumer = { $$typeof: REACT_CONSUMER_TYPE, _context: context };
	return context as unknown as ReactContext<T>;
}

export type ReactDispatcher = {
	useState(initial: unknown): readonly [unknown, (value: unknown) => void];
	useReducer(
		reducer: (state: unknown, action: unknown) => unknown,
		initialArg: unknown,
		initializer?: (value: unknown) => unknown
	): readonly [unknown, (action: unknown) => void];
	useRef(initial: unknown): { current: unknown };
	useMemo(factory: () => unknown, deps?: DependencyList): unknown;
	useCallback<T extends (...args: any[]) => unknown>(callback: T, deps?: DependencyList): T;
	useDebugValue(value: unknown, format?: (value: unknown) => unknown): void;
	useContext<T>(context: ReactContext<T>): T;
	useEffect(create: () => void | (() => void), deps?: DependencyList): void;
	useLayoutEffect(create: () => void | (() => void), deps?: DependencyList): void;
	useInsertionEffect(create: () => void | (() => void), deps?: DependencyList): void;
	useImperativeHandle(
		ref: ReactRef<unknown> | undefined,
		create: () => unknown,
		deps?: DependencyList
	): void;
	useId(): string;
	useSyncExternalStore(
		subscribe: ExternalStoreSubscribe,
		getSnapshot: () => unknown,
		getServerSnapshot?: () => unknown
	): unknown;
	useTransition(): readonly [boolean, (scope: () => void | Promise<void>) => void];
	useDeferredValue(value: unknown, initialValue?: unknown): unknown;
	use(usable: PromiseLike<unknown> | ReactContext<unknown>): unknown;
	useActionState(
		action: (previous: unknown, payload: unknown) => unknown,
		initialState: unknown,
		permalink?: string
	): readonly [unknown, (payload: unknown) => void, boolean];
	useOptimistic(
		passthrough: unknown,
		reducer?: (state: unknown, action: unknown) => unknown
	): readonly [unknown, (action: unknown) => void];
	useEffectEvent<T extends (...args: any[]) => unknown>(implementation: T): T;
	useMemoCache(size: number): unknown[];
	readContext?<T>(context: ReactContext<T>): T;
};

export type ReactAsyncDispatcher = {
	getCacheForType?<T>(resourceType: () => T): T;
	cacheSignal?(): AbortSignal;
	getOwner?(): unknown;
};

/** Minimal ancestry and hook state used for owner stacks and context bridges. */
export type ReactOwnerFrame = {
	type: unknown;
	return: ReactOwnerFrame | null;
	child: ReactOwnerFrame | null;
	sibling: ReactOwnerFrame | null;
	alternate: null;
	memoizedState: { memoizedState: unknown; next: ReactOwnerFrame['memoizedState'] } | null;
	stateNode: unknown;
};

export const ReactSharedInternals18 = {
	ReactCurrentDispatcher: { current: null as ReactDispatcher | null },
	ReactCurrentBatchConfig: { transition: null as unknown },
	ReactCurrentOwner: { current: null as unknown },
	ReactDebugCurrentFrame: {
		getStackAddendum: () => '',
		setExtraStackFrame: (_frame: string | null) => {}
	},
	ReactCurrentActQueue: {
		current: null as unknown[] | null,
		isBatchingLegacy: false,
		didScheduleLegacyUpdate: false
	}
};

export const ReactSharedInternals19 = {
	H: null as ReactDispatcher | null,
	A: null as ReactAsyncDispatcher | null,
	T: null as unknown,
	S: null as ((transition: unknown, returnValue: unknown) => void) | null,
	actQueue: null as unknown[] | null,
	asyncTransitions: 0,
	isBatchingLegacy: false,
	didScheduleLegacyUpdate: false,
	didUsePromise: false,
	thrownErrors: [] as unknown[],
	getCurrentStack: null as (() => string) | null,
	recentlyCreatedOwnerStacks: 0
};

export function resolveDispatcher(): ReactDispatcher {
	const dispatcher =
		target === 18
			? ReactSharedInternals18.ReactCurrentDispatcher.current
			: ReactSharedInternals19.H;
	if (!dispatcher)
		throw new Error(
			'Invalid hook call. Hooks can only be called inside a React compatibility component.'
		);
	return dispatcher;
}

function setCurrentDispatcher(dispatcher: ReactDispatcher | null): ReactDispatcher | null {
	if (target === 18) {
		const previous = ReactSharedInternals18.ReactCurrentDispatcher.current;
		ReactSharedInternals18.ReactCurrentDispatcher.current = dispatcher;
		return previous;
	}
	const previous = ReactSharedInternals19.H;
	ReactSharedInternals19.H = dispatcher;
	return previous;
}

export type ReactCacheScope = {
	roots: Map<object, Map<unknown, unknown>>;
	controller: AbortController;
};

export type ReactRootRuntime = {
	identifierPrefix: string;
	nextComponentId: number;
	onCaughtError?: (
		error: unknown,
		info: { componentStack: string; errorBoundary?: unknown }
	) => void;
	resources?: Map<string, { priority: number; html: string }>;
};

export const ReactCacheContext = createExactContext<ReactCacheScope>('react.cache', true);
export const ReactRootContext = createExactContext<ReactRootRuntime>('react.root', true);
const LegacyReactContext = createExactContext<Record<string, unknown>>('react.legacy-context');

let nextHookHostId = 1;
const ownerFrames = new WeakMap<ComponentInstance<any>, ReactOwnerFrame>();
let currentOwnerFrame: ReactOwnerFrame | null = null;

export function currentReactOwnerFrame(): ReactOwnerFrame | unknown | null {
	const externalOwner = ReactSharedInternals19.A?.getOwner?.();
	return externalOwner ?? currentOwnerFrame;
}

function createOwnerFrame(
	component: ComponentInstance<any>,
	type: unknown,
	stateNode: unknown = null
): ReactOwnerFrame {
	let parent = component.parent;
	let parentFrame: ReactOwnerFrame | undefined;
	while (parent && !parentFrame) {
		parentFrame = ownerFrames.get(parent);
		parent = parent.parent;
	}
	const frame: ReactOwnerFrame = {
		type,
		return: parentFrame ?? null,
		child: null,
		sibling: null,
		alternate: null,
		memoizedState: null,
		stateNode
	};
	if (parentFrame) {
		if (!parentFrame.child) parentFrame.child = frame;
		else {
			let sibling = parentFrame.child;
			while (sibling.sibling) sibling = sibling.sibling;
			sibling.sibling = frame;
		}
	}
	ownerFrames.set(component, frame);
	return frame;
}

function removeOwnerFrame(component: ComponentInstance<any>): void {
	const frame = ownerFrames.get(component);
	if (!frame) return;
	const parent = frame.return;
	if (parent?.child === frame) parent.child = frame.sibling;
	else if (parent) {
		let sibling = parent.child;
		while (sibling?.sibling && sibling.sibling !== frame) sibling = sibling.sibling;
		if (sibling?.sibling === frame) sibling.sibling = frame.sibling;
	}
	frame.return = null;
	frame.child = null;
	frame.sibling = null;
	frame.memoizedState = null;
	frame.stateNode = null;
	ownerFrames.delete(component);
}

export class HookHost {
	private committed: HookSlot[] = [];
	private working: HookSlot[] | undefined;
	private cursor = 0;
	private rendering = false;
	private disposed = false;
	private expectedHooks: number | undefined;
	private mounted = false;
	private commitScheduled = false;
	private passiveScheduled = false;
	private readonly id: number;
	private readonly identifierPrefix: string;
	private readonly providedContexts = new Map<ReactContext<unknown>, Reactive<ContextCell>>();
	private readonly onProfile = profileStack.at(-1);

	constructor(private readonly component: Component<Record<string, unknown>>) {
		const runtime = readReactRootRuntime(component);
		this.id = runtime ? ++runtime.nextComponentId : nextHookHostId++;
		this.identifierPrefix = runtime?.identifierPrefix ?? '';
	}

	exactContext<T>(context: ContextToken<T>): T {
		return this.component.getContext(context);
	}

	render(run: () => ReactNode): ReactNode {
		const profileStarted = this.onProfile ? performance.now() : undefined;
		if (this.disposed) throw new Error('Cannot render an unmounted React compatibility component');
		if (this.rendering) throw new Error('React compatibility component rendered recursively');
		this.rendering = true;
		this.cursor = 0;
		this.working = this.committed.map(cloneHookSlot);
		this.syncOwnerHooks();
		const previous = currentHost;
		const previousRuntime = currentRootRuntime;
		const previousDispatcher = setCurrentDispatcher(createExactDispatcher(this));
		const previousOwnerFrame = currentOwnerFrame;
		const previousReact18Owner = ReactSharedInternals18.ReactCurrentOwner.current;
		currentOwnerFrame = ownerFrames.get(this.component as ComponentInstance<any>) ?? null;
		ReactSharedInternals18.ReactCurrentOwner.current = currentOwnerFrame;
		currentHost = this;
		currentRootRuntime = readReactRootRuntime(this.component);
		try {
			const output = run();
			if (this.expectedHooks !== undefined && this.cursor !== this.expectedHooks) {
				throw new Error(
					`Rendered ${this.cursor} hooks, but the previous render used ${this.expectedHooks}`
				);
			}
			this.expectedHooks = this.cursor;
			this.committed = this.working;
			if (currentOwnerFrame) currentOwnerFrame.memoizedState = ownerHookList(this.committed);
			return output;
		} finally {
			ReactSharedInternals18.ReactCurrentOwner.current = previousReact18Owner;
			currentOwnerFrame = previousOwnerFrame;
			setCurrentDispatcher(previousDispatcher);
			currentHost = previous;
			currentRootRuntime = previousRuntime;
			this.working = undefined;
			this.rendering = false;
			if (profileStarted !== undefined) {
				this.onProfile?.(
					Object.freeze({
						subsystem: 'react-compat',
						phase: 'render',
						elapsedMs: performance.now() - profileStarted,
						counts: Object.freeze({ hooks: this.cursor })
					})
				);
			}
		}
	}

	dispose(): void {
		this.disposed = true;
		this.mounted = false;
		this.commitScheduled = false;
		this.passiveScheduled = false;
		let firstError: unknown;
		for (const slot of this.committed) {
			try {
				if (slot.kind === 'effect') runEffectCleanup(slot);
				else if (slot.kind === 'external-store') slot.unsubscribe?.();
			} catch (error) {
				firstError ??= error;
			}
		}
		this.committed = [];
		this.working = undefined;
		this.providedContexts.clear();
		if (firstError !== undefined) throw firstError;
	}

	mount(): void {
		if (this.disposed) return;
		this.mounted = true;
		this.commit();
	}

	scheduleCommit(): void {
		if (!this.mounted || this.disposed || this.commitScheduled) return;
		this.commitScheduled = true;
		queueMicrotask(() => {
			this.commitScheduled = false;
			if (!this.disposed && this.mounted) this.commit();
		});
	}

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

	private commit(): void {
		const profileStarted = this.onProfile ? performance.now() : undefined;
		try {
			this.commitEffects('insertion');
			this.commitExternalStores();
			this.commitEffects('layout');
			if (
				this.committed.some(
					(slot) => slot.kind === 'effect' && slot.effectKind === 'passive' && slot.pending
				)
			)
				this.schedulePassiveEffects();
		} finally {
			if (profileStarted !== undefined) {
				this.onProfile?.(
					Object.freeze({
						subsystem: 'react-compat',
						phase: 'commit',
						elapsedMs: performance.now() - profileStarted,
						counts: Object.freeze({ hooks: this.committed.length })
					})
				);
			}
		}
	}

	private commitEffects(kind: EffectKind): void {
		for (const slot of this.committed) {
			if (slot.kind !== 'effect' || slot.effectKind !== kind || !slot.pending) continue;
			slot.pending = false;
			runEffectCleanup(slot);
			const cleanup = slot.create();
			if (cleanup !== undefined && typeof cleanup !== 'function')
				throw new TypeError(`${kind} effect must return a cleanup function or undefined`);
			slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
		}
	}

	private schedulePassiveEffects(): void {
		if (this.passiveScheduled) return;
		this.passiveScheduled = true;
		queueMicrotask(() => {
			this.passiveScheduled = false;
			if (!this.disposed && this.mounted) this.commitEffects('passive');
		});
	}

	private commitExternalStores(): void {
		for (const slot of this.committed) {
			if (slot.kind !== 'external-store' || !slot.pendingSubscription) continue;
			slot.pendingSubscription = false;
			slot.unsubscribe?.();
			const notify = () => {
				if (this.disposed) return;
				const next = slot.getSnapshot();
				if (Object.is(next, slot.value)) return;
				slot.value = next;
				this.invalidate();
			};
			slot.unsubscribe = slot.subscribe(notify);
			if (typeof slot.unsubscribe !== 'function')
				throw new TypeError('useSyncExternalStore subscribe must return an unsubscribe function');
			notify();
		}
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
	private syncOwnerHooks(): void {
		const frame = ownerFrames.get(this.component as ComponentInstance<any>);
		if (frame && this.working) frame.memoizedState = ownerHookList(this.working);
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

	private invalidate(): void {
		const state = this.component.state;
		state.__reactRevision = Number(state.__reactRevision ?? 0) + 1;
	}
}

function ownerHookList(slots: readonly HookSlot[]): ReactOwnerFrame['memoizedState'] {
	let first: ReactOwnerFrame['memoizedState'] = null;
	let previous: NonNullable<ReactOwnerFrame['memoizedState']> | undefined;
	for (const slot of slots) {
		const hook = {
			memoizedState: ownerHookValue(slot),
			next: null as ReactOwnerFrame['memoizedState']
		};
		if (!first) first = hook;
		else previous!.next = hook;
		previous = hook;
	}
	return first;
}

function ownerHookValue(slot: HookSlot): unknown {
	if (slot.kind === 'ref') return slot.value;
	if (slot.kind === 'effect') return slot.cleanup ?? slot.create;
	if (slot.kind === 'external-store') return slot.value;
	if (slot.kind === 'effect-event') return slot.callback;
	if (slot.kind === 'memo-cache') return slot.value;
	return slot.value;
}

let currentHost: HookHost | undefined;
let currentRootRuntime: ReactRootRuntime | undefined;
export function activeHookHost(): HookHost {
	if (!currentHost)
		throw new Error(
			'Invalid hook call. Hooks can only be called inside a React compatibility component.'
		);
	return currentHost;
}

function createExactDispatcher(host: HookHost): ReactDispatcher {
	const dispatcher: ReactDispatcher = {
		useState: (initial) => host.state(initial),
		useReducer: (reducer, initialArg, initializer) =>
			host.reducer(reducer, initialArg, initializer),
		useRef: (initial) => host.ref(initial),
		useMemo: (factory, deps) => host.memo(factory, deps),
		useCallback: (callback, deps) => host.memo(() => callback, deps) as typeof callback,
		useDebugValue: (value, format) => host.debug(format ? format(value) : value),
		useContext: (context) => host.context(context),
		readContext: (context) => host.context(context),
		useEffect: (create, deps) => host.effect('passive', create, deps),
		useLayoutEffect: (create, deps) => host.effect('layout', create, deps),
		useInsertionEffect: (create, deps) => host.effect('insertion', create, deps),
		useImperativeHandle: (ref, create, deps) =>
			host.effect(
				'layout',
				() => {
					assignReactRef(ref, create());
					return () => assignReactRef(ref, null);
				},
				deps === undefined ? undefined : [...deps, ref]
			),
		useId: () => host.idValue(),
		useSyncExternalStore: (subscribe, getSnapshot) => host.externalStore(subscribe, getSnapshot),
		useTransition: () => {
			const [pending, setPending] = dispatcher.useState(false);
			const start = dispatcher.useCallback((scope: () => void | Promise<void>) => {
				setPending(true);
				try {
					const result = scope();
					if (isThenableValue(result))
						void Promise.resolve(result).then(
							() => setPending(false),
							() => setPending(false)
						);
					else queueMicrotask(() => setPending(false));
				} catch (error) {
					setPending(false);
					throw error;
				}
			}, []);
			return [Boolean(pending), start];
		},
		useDeferredValue: (value, initialValue) =>
			host.deferred(value, initialValue, arguments.length > 1),
		use: (usable) =>
			isReactContextValue(usable) ? host.usableContext(usable) : readCompatibleThenable(usable),
		useActionState: (action, initialState) => {
			const [state, setState] = dispatcher.useState(initialState);
			const [pending, setPending] = dispatcher.useState(false);
			const dispatch = dispatcher.useCallback(
				(payload: unknown) => {
					setPending(true);
					let result: unknown;
					try {
						result = action(state, payload);
					} catch (error) {
						setPending(false);
						throw error;
					}
					if (isThenableValue(result))
						void Promise.resolve(result).then(
							(value) => {
								setState(value);
								setPending(false);
							},
							() => setPending(false)
						);
					else {
						setState(result);
						setPending(false);
					}
				},
				[action, state]
			);
			return [state, dispatch, Boolean(pending)];
		},
		useOptimistic: (passthrough, reducer) => host.optimistic(passthrough, reducer),
		useEffectEvent: (implementation) => host.effectEvent(implementation),
		useMemoCache: (size) => host.memoCache(size)
	};
	return dispatcher;
}

function isThenableValue(value: unknown): value is PromiseLike<unknown> {
	return (
		!!value &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}

function isReactContextValue(value: unknown): value is ReactContext<unknown> {
	return (
		!!value &&
		typeof value === 'object' &&
		(value as { $$typeof?: unknown }).$$typeof === REACT_CONTEXT_TYPE
	);
}

function readCompatibleThenable(value: PromiseLike<unknown>): unknown {
	const tracked = value as PromiseLike<unknown> & {
		status?: string;
		value?: unknown;
		reason?: unknown;
	};
	if (tracked.status === 'fulfilled') return tracked.value;
	if (tracked.status === 'rejected') throw tracked.reason;
	if (tracked.status !== 'pending') {
		tracked.status = 'pending';
		tracked.then(
			(result) => {
				tracked.status = 'fulfilled';
				tracked.value = result;
			},
			(error) => {
				tracked.status = 'rejected';
				tracked.reason = error;
			}
		);
	}
	throw tracked;
}

export function activeReactCacheScope(): ReactCacheScope | undefined {
	if (!currentHost) return undefined;
	try {
		return currentHost.exactContext(ReactCacheContext);
	} catch {
		return undefined;
	}
}

export function recordReactResourceHint(key: string, priority: number, html: string): boolean {
	const resources = currentRootRuntime?.resources;
	if (!resources) return false;
	if (!resources.has(key)) resources.set(key, { priority, html });
	return true;
}

const adapterCache = new WeakMap<object, ComponentFunction<any, any>>();
const classInstanceOwners = new WeakMap<object, ComponentInstance<any>>();
const unmountedClassInstances = new WeakSet<object>();
const unsetRef = Symbol('exact.react.unset-ref');

class ReactRefEnvelope {
	constructor(readonly value: unknown) {}
}

const objectRefEnvelopes = new WeakMap<object, ReactRefEnvelope>();

function envelopeReactRef(ref: unknown): ReactRefEnvelope {
	if (ref !== null && (typeof ref === 'object' || typeof ref === 'function')) {
		const identity = ref as object;
		let envelope = objectRefEnvelopes.get(identity);
		if (!envelope) {
			envelope = new ReactRefEnvelope(ref);
			objectRefEnvelopes.set(identity, envelope);
		}
		return envelope;
	}
	return new ReactRefEnvelope(ref);
}

function readReactRef(value: unknown): unknown {
	const envelope = unwrap(value) as ReactRefEnvelope | undefined;
	return envelope?.value;
}

/** Resolves a public React class instance to its eXact component owner. */
export function exactComponentForReactInstance(value: unknown): ComponentInstance<any> | undefined {
	return value !== null && (typeof value === 'object' || typeof value === 'function')
		? classInstanceOwners.get(value as object)
		: undefined;
}

export function isUnmountedReactClassInstance(value: unknown): boolean {
	return value !== null && (typeof value === 'object' || typeof value === 'function')
		? unmountedClassInstances.has(value as object)
		: false;
}

export function adaptReactType(
	type: ReactComponentType<any>
): ComponentFunction<Record<string, unknown>, Record<string, unknown>> {
	const identity = type as object;
	const cached = adapterCache.get(identity);
	if (cached) return cached;
	if (isReactClassType(type)) {
		const classAdapter = createClassAdapter(type);
		adapterCache.set(identity, classAdapter);
		return classAdapter;
	}
	const displayName = reactTypeName(type);
	const adapter = function ReactCompatibilityAdapter(
		this: Component<Record<string, unknown>>,
		props: Record<string, unknown>
	) {
		this.state.__reactRevision = 0;
		const exactInstance = this as ComponentInstance<Record<string, unknown>>;
		createOwnerFrame(exactInstance, type);
		const host = new HookHost(this);
		let mounted = false;
		let previousMemoProps: Record<string, unknown> | undefined;
		let previousMemoOutput: ReactNode;
		let previousRevision = -1;
		let previousRef: unknown = unsetRef;
		this.onMount(() => {
			mounted = true;
			host.mount();
		});
		this.onRender(() => {
			if (mounted) host.scheduleCommit();
		});
		this.onUnmount(() => {
			try {
				host.dispose();
			} finally {
				removeOwnerFrame(exactInstance);
			}
		});
		return () => {
			const revision = Number(this.state.__reactRevision);
			const snapshot = snapshotProps(props);
			const ref = readReactRef(snapshot[REACT_REF_PROP]);
			delete snapshot[REACT_REF_PROP];
			const refChanged = previousRef !== unsetRef && !Object.is(previousRef, ref);
			const special =
				typeof type === 'object' && type !== null ? (type as ReactSpecialType) : undefined;
			if (
				!refChanged &&
				special?.$$typeof === REACT_MEMO_TYPE &&
				previousMemoProps &&
				previousRevision === revision &&
				!host.contextChanged()
			) {
				const compare = special.compare ?? shallowEqualProps;
				if (compare(previousMemoProps, snapshot)) return toExactNode(previousMemoOutput);
			}
			const output = host.render(() => invokeReactType(type, snapshot, ref));
			previousMemoProps = snapshot;
			previousMemoOutput = output;
			previousRevision = revision;
			previousRef = ref;
			return toExactNode(output);
		};
	} as ComponentFunction<Record<string, unknown>, Record<string, unknown>>;
	Object.defineProperty(adapter, 'name', {
		configurable: true,
		value: `ExactReact(${displayName})`
	});
	adapterCache.set(identity, adapter);
	return adapter;
}

function createClassAdapter(
	type: ReactClassType<Record<string, unknown>>
): ComponentFunction<Record<string, unknown>, Record<string, unknown>> {
	const displayName = reactTypeName(type);
	const adapter = function ReactClassCompatibilityAdapter(
		this: Component<Record<string, unknown>>,
		reactiveProps: Record<string, unknown>
	) {
		this.state.__reactRevision = 0;
		const statics = type as ReactClassType<Record<string, unknown>> & ClassStatics;
		const initialSnapshot = classProps(reactiveProps);
		let currentRef = initialSnapshot.ref;
		const initialContext = readClassContext(this, statics.contextType, statics.contextTypes);
		const publicInstance = new type(initialSnapshot.props, initialContext) as ReactClassInstance<
			Record<string, unknown>
		> &
			ClassLifecycles;
		const exactInstance = this as ComponentInstance<Record<string, unknown>>;
		const ownerFrame = createOwnerFrame(exactInstance, type, publicInstance);
		Object.defineProperty(publicInstance, '_reactInternals', {
			configurable: true,
			writable: true,
			value: ownerFrame
		});
		classInstanceOwners.set(publicInstance as object, exactInstance);
		unmountedClassInstances.delete(publicInstance as object);
		if (publicInstance.state === undefined) publicInstance.state = null;
		publicInstance.props = initialSnapshot.props;
		publicInstance.context = initialContext;
		publicInstance.refs ??= {};

		let constructing = true;
		let mounted = false;
		let force = false;
		let capturedWithoutDerivedState = false;
		let output: ReactNode = null;
		let committedProps = initialSnapshot.props;
		let committedState = publicInstance.state;
		let pendingDidUpdate:
			| { props: Record<string, unknown>; state: unknown; snapshot: unknown }
			| undefined;
		let commitScheduled = false;
		const callbacks: Array<() => void> = [];

		const invalidate = () => {
			if (!constructing) this.state.__reactRevision = Number(this.state.__reactRevision ?? 0) + 1;
		};
		const mergeState = (partial: unknown, notify: boolean) => {
			if (partial === null || partial === undefined) return false;
			if (typeof partial !== 'object')
				throw new TypeError('React class setState updater must return an object or null');
			const previous = publicInstance.state;
			publicInstance.state =
				previous && typeof previous === 'object'
					? { ...previous, ...(partial as object) }
					: { ...(partial as object) };
			capturedWithoutDerivedState = false;
			if (notify) invalidate();
			return true;
		};
		const updater = {
			setState: (
				update: object | null | ((previous: unknown, props: unknown) => object | null),
				callback?: () => void
			) => {
				const partial =
					typeof update === 'function'
						? update(publicInstance.state, publicInstance.props)
						: update;
				const changed = mergeState(partial, true);
				if (callback) callbacks.push(callback);
				if (!changed && callback) invalidate();
			},
			forceUpdate: (callback?: () => void) => {
				force = true;
				capturedWithoutDerivedState = false;
				if (callback) callbacks.push(callback);
				invalidate();
			}
		};
		Object.defineProperty(publicInstance, REACT_CLASS_UPDATER, {
			configurable: true,
			value: updater
		});

		if (isErrorBoundary(publicInstance, statics)) {
			const base = createErrorContext();
			this.setContext(ErrorContext, {
				...base,
				boundary: this as never,
				report: (error: unknown, options?: Parameters<typeof base.report>[1]) => {
					const report = base.report(error, options);
					const derived = statics.getDerivedStateFromError?.(report.error);
					const hasDerivedState = mergeState(derived, true);
					capturedWithoutDerivedState = !hasDerivedState;
					const stack = componentStack(report);
					publicInstance.componentDidCatch?.(report.error, { componentStack: stack });
					readReactRootRuntime(this)?.onCaughtError?.(report.error, {
						componentStack: stack,
						errorBoundary: publicInstance
					});
					return report;
				}
			});
		}

		const flushCommit = () => {
			commitScheduled = false;
			if (!mounted) return;
			const update = pendingDidUpdate;
			pendingDidUpdate = undefined;
			if (update) {
				try {
					publicInstance.componentDidUpdate?.(update.props, update.state, update.snapshot);
				} catch (error) {
					routeClassLifecycleError(this, error, 'componentDidUpdate');
				}
			}
			const pendingCallbacks = callbacks.splice(0, callbacks.length);
			for (const callback of pendingCallbacks) {
				try {
					callback.call(publicInstance);
				} catch (error) {
					routeClassLifecycleError(this, error, 'setState-callback');
				}
			}
		};
		const scheduleCommit = () => {
			if (commitScheduled) return;
			commitScheduled = true;
			queueMicrotask(flushCommit);
		};

		this.onMount(() => {
			mounted = true;
			assignReactRef(currentRef as ReactRef<unknown> | undefined, publicInstance);
			publicInstance.componentDidMount?.();
			scheduleCommit();
		});
		this.onRender(scheduleCommit);
		this.onUnmount(() => {
			mounted = false;
			removeOwnerFrame(exactInstance);
			try {
				publicInstance.componentWillUnmount?.();
			} finally {
				assignReactRef(currentRef as ReactRef<unknown> | undefined, null);
				callbacks.splice(0, callbacks.length);
				delete (publicInstance as unknown as Record<PropertyKey, unknown>)[REACT_CLASS_UPDATER];
				classInstanceOwners.delete(publicInstance as object);
				unmountedClassInstances.add(publicInstance as object);
				(publicInstance as unknown as { _reactInternals?: unknown })._reactInternals = null;
			}
		});

		return () => {
			Number(this.state.__reactRevision);
			const previousRuntime = currentRootRuntime;
			const previousOwnerFrame = currentOwnerFrame;
			const previousReact18Owner = ReactSharedInternals18.ReactCurrentOwner.current;
			currentOwnerFrame = ownerFrame;
			ReactSharedInternals18.ReactCurrentOwner.current = ownerFrame;
			currentRootRuntime = readReactRootRuntime(this);
			try {
				const nextSnapshot = classProps(reactiveProps);
				const nextContext = readClassContext(this, statics.contextType, statics.contextTypes);
				const firstRender = constructing;
				const previousProps = committedProps;
				const previousState = committedState;
				const receivesProps = !shallowEqualProps(previousProps, nextSnapshot.props);

				if (!firstRender && receivesProps && !statics.getDerivedStateFromProps) {
					publicInstance.componentWillReceiveProps?.(nextSnapshot.props, nextContext);
					publicInstance.UNSAFE_componentWillReceiveProps?.(nextSnapshot.props, nextContext);
				}
				const derived = statics.getDerivedStateFromProps?.(
					nextSnapshot.props,
					publicInstance.state
				);
				mergeState(derived, false);
				const nextState = publicInstance.state;

				let shouldUpdate = true;
				if (!firstRender && !force) {
					if (publicInstance.shouldComponentUpdate) {
						shouldUpdate =
							publicInstance.shouldComponentUpdate(nextSnapshot.props, nextState, nextContext) !==
							false;
					} else if (publicInstance.isPureReactComponent) {
						shouldUpdate =
							!shallowEqualProps(previousProps, nextSnapshot.props) ||
							!shallowEqualState(previousState, nextState);
					}
				}

				if (
					firstRender &&
					!statics.getDerivedStateFromProps &&
					!publicInstance.getSnapshotBeforeUpdate
				) {
					publicInstance.componentWillMount?.();
					publicInstance.UNSAFE_componentWillMount?.();
				} else if (
					!firstRender &&
					shouldUpdate &&
					!statics.getDerivedStateFromProps &&
					!publicInstance.getSnapshotBeforeUpdate
				) {
					publicInstance.componentWillUpdate?.(nextSnapshot.props, nextState, nextContext);
					publicInstance.UNSAFE_componentWillUpdate?.(nextSnapshot.props, nextState, nextContext);
				}

				publicInstance.props = nextSnapshot.props;
				publicInstance.state = nextState;
				publicInstance.context = nextContext;
				if (publicInstance.getChildContext) {
					const childContext = publicInstance.getChildContext();
					if (!childContext || typeof childContext !== 'object')
						throw new TypeError('getChildContext() must return an object');
					this.setContext(LegacyReactContext, { ...readLegacyContext(this), ...childContext });
				}
				if (nextSnapshot.ref !== currentRef) {
					const previousRef = currentRef;
					currentRef = nextSnapshot.ref;
					if (mounted)
						queueMicrotask(() => {
							try {
								assignReactRef(previousRef as ReactRef<unknown> | undefined, null);
								assignReactRef(currentRef as ReactRef<unknown> | undefined, publicInstance);
							} catch (error) {
								routeClassLifecycleError(this, error, 'ref');
							}
						});
				}

				if (shouldUpdate) {
					output = capturedWithoutDerivedState ? null : publicInstance.render();
					if (!firstRender) {
						const snapshot = publicInstance.getSnapshotBeforeUpdate?.(previousProps, previousState);
						pendingDidUpdate = { props: previousProps, state: previousState, snapshot };
					}
				}
				committedProps = nextSnapshot.props;
				committedState = publicInstance.state;
				force = false;
				constructing = false;
				return toExactNode(output);
			} finally {
				ReactSharedInternals18.ReactCurrentOwner.current = previousReact18Owner;
				currentOwnerFrame = previousOwnerFrame;
				currentRootRuntime = previousRuntime;
			}
		};
	} as ComponentFunction<Record<string, unknown>, Record<string, unknown>>;
	Object.defineProperty(adapter, 'name', {
		configurable: true,
		value: `ExactReactClass(${displayName})`
	});
	return adapter;
}

function readReactRootRuntime(
	component: Component<Record<string, unknown>>
): ReactRootRuntime | undefined {
	try {
		return component.getContext(ReactRootContext);
	} catch {
		return undefined;
	}
}

export function toExactNode(node: ReactNode): Child | Child[] {
	if (Array.isArray(node)) return node.map(toExactNode).flat() as Child[];
	if (
		node === null ||
		node === undefined ||
		typeof node === 'string' ||
		typeof node === 'number' ||
		typeof node === 'boolean'
	)
		return node;
	if (isVNode(node)) return node;
	if (isReactPortal(node)) {
		const children = childrenArray(node.children).map(toExactNode).flat() as Child[];
		return createPortal(node.containerInfo, ...children);
	}
	if (!isReactElement(node))
		throw new TypeError(
			`Objects are not valid as a React child (${Object.prototype.toString.call(node)})`
		);
	return reactElementToVNode(node);
}

function reactElementToVNode(element: ReactElement): VNode {
	const elementProps = element.props as Record<string, unknown> & { children?: ReactNode };
	const keyedProps: Record<string, unknown> = {
		...elementProps,
		...(element.key === null ? {} : { key: element.key })
	};
	const exactBoundary = exactComponentType(element.type);
	if (exactBoundary) {
		if (element.ref !== null && element.ref !== undefined && exactBoundary.refProp !== undefined) {
			Reflect.set(keyedProps, exactBoundary.refProp, element.ref);
		}
		if ('children' in keyedProps)
			keyedProps.children = toExactNode(elementProps.children as ReactNode);
		delete keyedProps.ref;
		return createVNode(exactBoundary.component, keyedProps);
	}
	if (typeof element.type === 'string') {
		normalizeReactHostProps(element.type, keyedProps);
		if (element.ref !== null && element.ref !== undefined)
			keyedProps.ref = reactRefBinding(element.ref as ReactRef<Element>);
		const children = childrenArray(elementProps.children).map(toExactNode).flat() as Child[];
		delete keyedProps.children;
		return createVNode(element.type, keyedProps, ...children);
	}
	if (element.type === REACT_FRAGMENT_TYPE || element.type === REACT_STRICT_MODE_TYPE) {
		const children = childrenArray(elementProps.children).map(toExactNode).flat() as Child[];
		delete keyedProps.children;
		return createVNode(ExactFragment, keyedProps, ...children);
	}
	if (element.type === REACT_SUSPENSE_TYPE) {
		return createVNode(ReactSuspenseBoundary, keyedProps);
	}
	if (element.type === REACT_ACTIVITY_TYPE) {
		const children =
			elementProps.mode === 'hidden'
				? []
				: (childrenArray(elementProps.children).map(toExactNode).flat() as Child[]);
		delete keyedProps.children;
		return createVNode(ExactFragment, keyedProps, ...children);
	}
	if (element.type === REACT_PROFILER_TYPE) {
		return createVNode(ReactProfilerBoundary, keyedProps);
	}
	if (typeof element.type === 'symbol')
		throw unsupportedType(element.type.description ?? String(element.type));
	// Preserve React element records across component boundaries. Converting
	// children here would break Children, cloneElement, and wrapper components.
	if (element.ref !== null && element.ref !== undefined)
		keyedProps[REACT_REF_PROP] = envelopeReactRef(element.ref);
	// `ref` is reserved by the eXact VNode runtime and must always be a
	// RefBinding. Component refs travel through the adapter-owned channel.
	delete keyedProps.ref;
	return createVNode(adaptReactType(element.type), keyedProps);
}

function exactComponentType(
	type: unknown
): { component: ComponentFunction<any, any>; refProp?: PropertyKey } | undefined {
	if ((typeof type !== 'function' && typeof type !== 'object') || type === null) return undefined;
	const candidate = type as {
		$$typeof?: unknown;
		exactComponent?: unknown;
		exactRefProp?: unknown;
	};
	return candidate.$$typeof === EXACT_COMPONENT_TYPE &&
		typeof candidate.exactComponent === 'function'
		? {
				component: candidate.exactComponent as ComponentFunction<any, any>,
				...(typeof candidate.exactRefProp === 'string' || typeof candidate.exactRefProp === 'symbol'
					? { refProp: candidate.exactRefProp }
					: {})
			}
		: undefined;
}

function invokeReactType(
	type: ReactComponentType<any>,
	props: Record<string, unknown>,
	ref?: unknown
): ReactNode {
	if (typeof type === 'function') {
		if (isReactClassType(type)) throw new Error('React class component adapter invariant failed');
		if (target === 19 && ref !== undefined) props.ref = ref;
		return (type as (props: Record<string, unknown>) => ReactNode)(props);
	}
	const special = type as ReactSpecialType;
	if (special.$$typeof === REACT_FORWARD_REF_TYPE && special.render)
		return special.render(props, ref ?? null);
	if (special.$$typeof === REACT_MEMO_TYPE && special.type)
		return invokeReactType(special.type, props, ref);
	if (special.$$typeof === REACT_LAZY_TYPE && special._init) {
		return invokeReactType(special._init(special._payload) as ReactComponentType<any>, props, ref);
	}
	if (
		special.$$typeof === REACT_PROVIDER_TYPE ||
		(special.$$typeof === REACT_CONTEXT_TYPE && 'value' in props)
	) {
		const context = contextForSpecial(special);
		activeHookHost().provide(context, props.value);
		return props.children as ReactNode;
	}
	if (special.$$typeof === REACT_CONSUMER_TYPE || special.$$typeof === REACT_CONTEXT_TYPE) {
		const context = contextForSpecial(special);
		if (typeof props.children !== 'function')
			throw new TypeError('A React context consumer requires a function child');
		return (props.children as (value: unknown) => ReactNode)(activeHookHost().context(context));
	}
	throw unsupportedType(reactTypeName(type));
}

const ReactProfilerBoundary = function ReactProfilerBoundary(
	this: Component<Record<string, unknown>>,
	props: Record<string, unknown>
) {
	let mounted = false;
	this.onMount(() => {
		mounted = true;
	});
	this.onRender(({ duration }) => {
		const callback = props.onRender;
		if (typeof callback !== 'function') return;
		const phase = mounted ? 'update' : 'mount';
		const commitTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
		queueMicrotask(() => {
			try {
				(callback as (...args: unknown[]) => void)(
					props.id,
					phase,
					duration,
					duration,
					commitTime - duration,
					commitTime
				);
			} catch (error) {
				routeClassLifecycleError(this, error, 'profiler');
			}
		});
	});
	return () => toExactNode(props.children as ReactNode);
} as ComponentFunction<Record<string, unknown>, Record<string, unknown>>;

const ReactSuspenseBoundary = function ReactSuspenseBoundary(
	this: Component<{ pending: number }>,
	props: Record<string, unknown>
) {
	this.state.pending = 0;
	const pending = new Set<PromiseLike<unknown>>();
	let active = true;
	this.setContext(SuspensionContext, {
		suspend: (promise) => {
			if (!active || pending.has(promise)) return;
			pending.add(promise);
			trackComponentAsync(this as unknown as ComponentInstance<Record<string, unknown>>, promise);
			this.state.pending = pending.size;
			const settle = () => {
				if (!active || !pending.delete(promise)) return;
				this.state.pending = pending.size;
			};
			Promise.resolve(promise).then(settle, settle);
		}
	});
	this.onUnmount(() => {
		active = false;
		pending.clear();
	});
	return () => toExactNode((this.state.pending ? props.fallback : props.children) as ReactNode);
} as ComponentFunction<{ pending: number }, Record<string, unknown>>;

function isReactPortal(value: unknown): value is import('./types.js').ReactPortal {
	return (
		!!value &&
		typeof value === 'object' &&
		(value as { $$typeof?: unknown }).$$typeof === REACT_PORTAL_TYPE
	);
}

function snapshotProps(props: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const key of Reflect.ownKeys(props)) if (typeof key === 'string') result[key] = props[key];
	return result;
}

function classProps(props: Record<string, unknown>): {
	props: Record<string, unknown>;
	ref: unknown;
} {
	const snapshot = snapshotProps(props);
	const ref = readReactRef(snapshot[REACT_REF_PROP]);
	delete snapshot[REACT_REF_PROP];
	return { props: snapshot, ref };
}

function isReactClassType(type: unknown): type is ReactClassType<Record<string, unknown>> {
	return (
		typeof type === 'function' && !!type.prototype && typeof type.prototype.render === 'function'
	);
}

function readClassContext(
	component: Component<Record<string, unknown>>,
	context: ReactContext<unknown> | undefined,
	legacyTypes?: Record<string, unknown>
): unknown {
	if (!context) {
		if (!legacyTypes) return undefined;
		const inherited = readLegacyContext(component) ?? {};
		return Object.fromEntries(Object.keys(legacyTypes).map((key) => [key, inherited[key]]));
	}
	try {
		return readComponentReactContext(component, context);
	} catch {
		return context._defaultValue;
	}
}

function readLegacyContext(component: Component<Record<string, unknown>>): Record<string, unknown> {
	try {
		return component.getContext(LegacyReactContext) as unknown as Record<string, unknown>;
	} catch {
		return {};
	}
}

function isErrorBoundary(instance: ClassLifecycles, statics: ClassStatics): boolean {
	return (
		typeof statics.getDerivedStateFromError === 'function' ||
		typeof instance.componentDidCatch === 'function'
	);
}

function componentStack(report: ErrorReport): string {
	return report.component ? `\n    at ${report.component.name}` : '';
}

function routeClassLifecycleError(
	component: Component<Record<string, unknown>>,
	error: unknown,
	phase: string
): void {
	const instance = component as ComponentInstance<Record<string, unknown>>;
	handleComponentError(instance, createErrorReport(error, 'lifecycle', instance, phase));
}

function shallowEqualState(previous: unknown, next: unknown): boolean {
	if (Object.is(previous, next)) return true;
	if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') return false;
	return shallowEqualProps(previous as Record<string, unknown>, next as Record<string, unknown>);
}

type ClassStatics = {
	contextType?: ReactContext<unknown>;
	contextTypes?: Record<string, unknown>;
	childContextTypes?: Record<string, unknown>;
	getDerivedStateFromProps?: (props: Record<string, unknown>, state: unknown) => object | null;
	getDerivedStateFromError?: (error: unknown) => object | null;
};

function normalizeReactHostProps(tag: string, props: Record<string, unknown>): void {
	const handlers = Object.entries(props).filter(
		([name, value]) => /^on[A-Z]/.test(name) && typeof value === 'function'
	);
	for (const [name, value] of handlers) {
		delete props[name];
		let normalized = name;
		if (name === 'onFocus' || name === 'onFocusCapture')
			normalized = name.replace('onFocus', 'onFocusIn');
		else if (name === 'onBlur' || name === 'onBlurCapture')
			normalized = name.replace('onBlur', 'onFocusOut');
		else if (
			(tag === 'input' || tag === 'textarea') &&
			(name === 'onChange' || name === 'onChangeCapture')
		) {
			const type = String(props.type ?? '').toLowerCase();
			if (type !== 'checkbox' && type !== 'radio' && type !== 'file')
				normalized = name.replace('onChange', 'onInput');
		}
		const wrapped = reactEventHandler(value as (event: Event) => unknown, props);
		const existing = props[normalized];
		props[normalized] =
			typeof existing === 'function'
				? function reactComposedHandler(this: Element, event: Event) {
						(existing as (this: Element, event: Event) => unknown).call(this, event);
						return wrapped.call(this, event);
					}
				: wrapped;
	}
}

function reactEventHandler(handler: (event: Event) => unknown, props: Record<string, unknown>) {
	return function exactReactEvent(this: Element, event: Event): unknown {
		augmentReactEvent(event);
		try {
			return handler.call(this, event);
		} finally {
			if (
				this instanceof HTMLInputElement ||
				this instanceof HTMLTextAreaElement ||
				this instanceof HTMLSelectElement
			) {
				if (props.value !== undefined && 'value' in this)
					this.value = String(unwrap(props.value) ?? '');
				if (this instanceof HTMLInputElement && props.checked !== undefined)
					this.checked = Boolean(unwrap(props.checked));
			}
		}
	};
}

function augmentReactEvent(event: Event): void {
	const record = event as Event & {
		nativeEvent?: Event;
		persist?: () => void;
		isDefaultPrevented?: () => boolean;
		isPropagationStopped?: () => boolean;
	};
	record.nativeEvent ??= event;
	record.persist ??= () => {};
	record.isDefaultPrevented ??= () => event.defaultPrevented;
	record.isPropagationStopped ??= () => event.cancelBubble;
}

type ClassLifecycles = ReactClassInstance<Record<string, unknown>> & {
	isPureReactComponent?: boolean;
	componentWillMount?(): void;
	UNSAFE_componentWillMount?(): void;
	componentWillReceiveProps?(props: Record<string, unknown>, context: unknown): void;
	UNSAFE_componentWillReceiveProps?(props: Record<string, unknown>, context: unknown): void;
	componentWillUpdate?(props: Record<string, unknown>, state: unknown, context: unknown): void;
	UNSAFE_componentWillUpdate?(
		props: Record<string, unknown>,
		state: unknown,
		context: unknown
	): void;
};

function childrenArray(children: ReactNode | undefined): ReactNode[] {
	return Array.isArray(children) ? children : children === undefined ? [] : [children];
}

function readComponentReactContext(
	component: Component<Record<string, unknown>>,
	context: ReactContext<unknown>
): unknown {
	const value = component.getContext(contextToken(context));
	return context._exactContextMode === 'value' ? value : (value as Reactive<ContextCell>).current;
}

function contextToken(context: ReactContext<any>): ContextToken<any> {
	return context._exactToken as ContextToken<any>;
}

function contextForSpecial(special: ReactSpecialType): ReactContext<unknown> {
	const value = (special as ReactSpecialType & { _context?: unknown })._context ?? special;
	if (!value || typeof value !== 'object' || !('_exactToken' in value))
		throw new TypeError('Invalid React context object');
	return value as unknown as ReactContext<unknown>;
}

function shallowEqualProps(
	previous: Record<string, unknown>,
	next: Record<string, unknown>
): boolean {
	const previousKeys = Object.keys(previous);
	const nextKeys = Object.keys(next);
	return (
		previousKeys.length === nextKeys.length &&
		previousKeys.every(
			(key) =>
				Object.prototype.hasOwnProperty.call(next, key) && Object.is(previous[key], next[key])
		)
	);
}

const refBindings = new WeakMap<object, RefBinding<unknown>>();
function reactRefBinding<T>(ref: ReactRef<T>): RefBinding<T> {
	const identity = ref as object;
	const cached = refBindings.get(identity);
	if (cached) return cached as RefBinding<T>;
	let cleanup: (() => void) | undefined;
	const binding: RefBinding<T> = {
		key: { id: Symbol('react.ref'), description: 'React compatibility ref' },
		owner: undefined as never,
		fulfill(value) {
			const rawRef = unwrap(ref) as ReactRef<T>;
			if (value === undefined) {
				if (cleanup) {
					const run = cleanup;
					cleanup = undefined;
					run();
				} else if (typeof rawRef === 'function') rawRef(null);
				else if (rawRef) rawRef.current = null;
				return;
			}
			if (typeof rawRef === 'function') {
				const result = rawRef(value);
				cleanup = typeof result === 'function' ? result : undefined;
			} else if (rawRef) rawRef.current = value;
		}
	};
	refBindings.set(identity, binding as RefBinding<unknown>);
	return binding;
}

export function assignReactRef<T>(ref: ReactRef<T> | undefined, value: T | null): void {
	if (!ref) return;
	const rawRef = unwrap(ref) as ReactRef<T>;
	if (typeof rawRef === 'function') rawRef(value);
	else if (rawRef) rawRef.current = value;
}

function reactTypeName(type: unknown): string {
	if (typeof type === 'function')
		return (
			(type as { displayName?: string; name?: string }).displayName ?? type.name ?? 'Anonymous'
		);
	if (type && typeof type === 'object') {
		const special = type as ReactSpecialType;
		if (special.$$typeof === REACT_FORWARD_REF_TYPE)
			return `ForwardRef(${reactTypeName(special.render)})`;
		if (special.$$typeof === REACT_MEMO_TYPE) return `Memo(${reactTypeName(special.type)})`;
	}
	return String(type);
}

function unsupportedType(name: string): Error {
	return new Error(`Unsupported React component type ${name}`);
}
