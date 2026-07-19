import { flushSync } from '@exact/reactive';
import {
	activeReactCacheScope,
	createReactContext,
	currentReactOwnerFrame,
	isReactElement,
	REACT_ACTIVITY_TYPE,
	REACT_CLASS_UPDATER,
	REACT_FORWARD_REF_TYPE,
	REACT_FRAGMENT_TYPE,
	REACT_LAZY_TYPE,
	REACT_MEMO_TYPE,
	REACT_PROFILER_TYPE,
	REACT_STRICT_MODE_TYPE,
	REACT_SUSPENSE_TYPE,
	reactCompatibilityTarget,
	reactElementSymbol,
	ReactSharedInternals18,
	ReactSharedInternals19,
	resolveDispatcher,
	withReactProfile
} from './internals.js';
import type {
	DependencyList,
	Dispatch,
	Key,
	MutableRefObject,
	ReactComponentType,
	ReactContext,
	ReactElement,
	ReactNode,
	ReactRef,
	Reducer,
	SetStateAction
} from './types.js';

export type { ReactCompatibilityProfileEvent } from './internals.js';
export type * from './types.js';
export { withReactProfile };

export const Fragment = REACT_FRAGMENT_TYPE;
export const StrictMode = REACT_STRICT_MODE_TYPE;
export const Profiler = REACT_PROFILER_TYPE;
export const Suspense = REACT_SUSPENSE_TYPE;
export const Activity = REACT_ACTIVITY_TYPE;
export const ViewTransition = Symbol.for('react.view_transition');
export const version = '19.2.0-exact';
export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactSharedInternals18;
export const __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
	ReactSharedInternals19;
// React's server condition exposes a smaller view (H, A, stack bookkeeping).
// Keeping it on the same target singleton is intentional: a package graph must
// never acquire a second dispatcher merely because it crossed an export condition.
export const __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
	ReactSharedInternals19;

/** Creates a React-compatible element while preserving target-specific key and ref semantics. */
export function createElement<P extends object>(
	type: string | symbol | ReactComponentType<P>,
	config?: (P & { key?: Key; ref?: unknown }) | null,
	...children: ReactNode[]
): ReactElement<P> {
	const source = config ?? ({} as P);
	const props: Record<string, unknown> = {};
	let key: string | null = null;
	let ref: unknown = null;
	for (const [name, value] of Object.entries(source)) {
		if (name === 'key') key = value === undefined ? null : String(value);
		else if (name === 'ref') ref = value;
		else props[name] = value;
	}
	if (children.length === 1) props.children = children[0];
	else if (children.length > 1) props.children = children;
	// React 19's reconciler reads refs from props. Retain the top-level field as
	// well because the eXact adapter and React 18 target consume that shape.
	if (reactCompatibilityTarget() === 19 && ref !== null) props.ref = ref;
	applyDefaultProps(type, props);
	return {
		$$typeof: reactElementSymbol(),
		type,
		key,
		ref,
		props: props as P & { children?: ReactNode },
		_owner: currentReactOwnerFrame(),
		_store: { validated: 0 }
	};
}

/** Clones an element, replacing supplied props and children without mutating the source element. */
export function cloneElement<P extends object>(
	element: ReactElement<P>,
	config?: Partial<P> & { key?: Key; ref?: unknown },
	...children: ReactNode[]
): ReactElement<P> {
	if (!isValidElement(element)) throw new TypeError('cloneElement requires a valid React element');
	const props = { ...element.props, ...(config ?? {}) } as Record<string, unknown> &
		P & { key?: Key; ref?: unknown; children?: ReactNode };
	const key = config && 'key' in config ? config.key : element.key;
	const ref = config && 'ref' in config ? config.ref : element.ref;
	delete props.key;
	delete props.ref;
	if (children.length === 1) props.children = children[0];
	else if (children.length > 1) props.children = children;
	return createElement(
		element.type,
		{ ...props, key: key ?? undefined, ref },
		...(children.length ? children : childrenFrom(props.children))
	) as ReactElement<P>;
}

/** Returns whether a value carries a supported React element marker. */
export function isValidElement(value: unknown): value is ReactElement {
	return isReactElement(value);
}

/** React-compatible utilities for traversing opaque children values. */
export const Children = Object.freeze({
	map<T>(children: ReactNode, callback: (child: ReactNode, index: number) => T): T[] | null {
		if (children === null || children === undefined) return null;
		return flattenChildren(children).map(callback);
	},
	forEach(children: ReactNode, callback: (child: ReactNode, index: number) => void): void {
		flattenChildren(children).forEach(callback);
	},
	count(children: ReactNode): number {
		return flattenChildren(children, false).length;
	},
	only(children: ReactNode): ReactElement {
		if (!isValidElement(children))
			throw new Error('React.Children.only expected to receive a single React element child.');
		return children;
	},
	toArray(children: ReactNode): ReactNode[] {
		return flattenChildren(children);
	}
});

/** Declares component-local state in the current compatibility render. */
export function useState<S>(initial: S | (() => S)): readonly [S, Dispatch<SetStateAction<S>>] {
	return resolveDispatcher().useState(initial) as readonly [S, Dispatch<SetStateAction<S>>];
}

/** Declares reducer-managed component state in the current compatibility render. */
export function useReducer<S, A>(reducer: Reducer<S, A>, initialArg: S): readonly [S, Dispatch<A>];
export function useReducer<S, I, A>(
	reducer: Reducer<S, A>,
	initialArg: I,
	initializer: (value: I) => S
): readonly [S, Dispatch<A>];
export function useReducer<S, I, A>(
	reducer: Reducer<S, A>,
	initialArg: I,
	initializer?: (value: I) => S
): readonly [S, Dispatch<A>] {
	return resolveDispatcher().useReducer(
		reducer as (state: unknown, action: unknown) => unknown,
		initialArg,
		initializer as ((value: unknown) => unknown) | undefined
	) as readonly [S, Dispatch<A>];
}

/** Returns a stable mutable ref object for the component lifetime. */
export function useRef<T>(initial: T): MutableRefObject<T> {
	return resolveDispatcher().useRef(initial) as MutableRefObject<T>;
}
/** Memoizes a computed value according to React dependency-list semantics. */
export function useMemo<T>(factory: () => T, deps?: DependencyList): T {
	return resolveDispatcher().useMemo(factory, deps) as T;
}
/** Memoizes a callback according to React dependency-list semantics. */
export function useCallback<T extends (...args: any[]) => any>(
	callback: T,
	deps?: DependencyList
): T {
	return resolveDispatcher().useCallback(callback, deps);
}
/** Records a developer-tools value without affecting rendering. */
export function useDebugValue<T>(value: T, format?: (value: T) => unknown): void {
	resolveDispatcher().useDebugValue(value, format as ((value: unknown) => unknown) | undefined);
}

/** Creates a component that receives its ref as a second render argument. */
export function forwardRef<P>(
	render: (props: P, ref: unknown) => ReactNode
): ReactComponentType<P> {
	return { $$typeof: REACT_FORWARD_REF_TYPE, render };
}

/** Creates a component wrapper that can skip renders when props compare equal. */
export function memo<P>(
	type: ReactComponentType<P>,
	compare?: (previous: P, next: P) => boolean
): ReactComponentType<P> {
	return { $$typeof: REACT_MEMO_TYPE, type, compare: compare ?? null };
}

/** Defers loading a component until its first render and suspends while it loads. */
export function lazy<P extends Record<string, unknown> = Record<string, unknown>>(
	loader: () => Promise<{ default: ReactComponentType<P> }>
): ReactComponentType<P> {
	const payload: LazyPayload<P> = { status: 'uninitialized', loader };
	return { $$typeof: REACT_LAZY_TYPE, _payload: payload, _init: initializeLazy };
}

/** Creates a React-compatible context backed by an eXact context token. */
export function createContext<T>(defaultValue: T): ReactContext<T> {
	return createReactContext(defaultValue);
}

/** Creates an object ref initialized to null. */
export function createRef<T>(): MutableRefObject<T | null> {
	return { current: null };
}

/** Base class for React-compatible class components. */
export class Component<P = Record<string, unknown>, S = Record<string, unknown>> {
	declare readonly isReactComponent: object;
	props: P;
	state!: S;
	context: unknown;
	refs: Record<string, unknown> = {};
	constructor(props: P, context?: unknown) {
		this.props = props;
		this.context = context;
	}
	/** Enqueues a partial state update through the mounted compatibility root. */
	setState(
		state: Partial<S> | null | ((previous: Readonly<S>, props: Readonly<P>) => Partial<S> | null),
		callback?: () => void
	): void {
		classUpdater(this).setState(state as never, callback);
	}
	/** Requests a render even when state and props are otherwise unchanged. */
	forceUpdate(callback?: () => void): void {
		classUpdater(this).forceUpdate(callback);
	}
	/** Produces this component's children; subclasses override this method. */
	render(): ReactNode {
		return null;
	}
}
Object.defineProperty(Component.prototype, 'isReactComponent', { value: {} });
/** Class component base that opts into shallow prop and state comparison. */
export class PureComponent<
	P = Record<string, unknown>,
	S = Record<string, unknown>
> extends Component<P, S> {
	readonly isPureReactComponent = true;
}

/** Reads the nearest value for a React-compatible context. */
export function useContext<T>(context: ReactContext<T>): T {
	return resolveDispatcher().useContext(context);
}
/** Schedules a passive effect after the render commits. */
export function useEffect(create: () => void | (() => void), deps?: DependencyList): void {
	resolveDispatcher().useEffect(create, deps);
}
/** Schedules a layout effect during the synchronous commit phase. */
export function useLayoutEffect(create: () => void | (() => void), deps?: DependencyList): void {
	resolveDispatcher().useLayoutEffect(create, deps);
}
/** Schedules an insertion effect before layout effects run. */
export function useInsertionEffect(create: () => void | (() => void), deps?: DependencyList): void {
	resolveDispatcher().useInsertionEffect(create, deps);
}
/** Assigns an imperative handle to a forwarded ref for the committed render. */
export function useImperativeHandle<T>(
	ref: ReactRef<T> | undefined,
	create: () => T,
	deps?: DependencyList
): void {
	resolveDispatcher().useImperativeHandle(ref as ReactRef<unknown> | undefined, create, deps);
}
/** Returns a stable identifier scoped by the current root's identifier prefix. */
export function useId(): string {
	return resolveDispatcher().useId();
}
/** Subscribes to an external store with tear-resistant snapshot reads. */
export function useSyncExternalStore<T>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
	_getServerSnapshot?: () => T
): T {
	return resolveDispatcher().useSyncExternalStore(subscribe, getSnapshot, _getServerSnapshot) as T;
}
/** Marks updates performed by a synchronous scope as non-urgent transition work. */
export function startTransition(scope: () => void): void {
	const previous18 = ReactSharedInternals18.ReactCurrentBatchConfig.transition;
	const previous19 = ReactSharedInternals19.T;
	const transition = {};
	ReactSharedInternals18.ReactCurrentBatchConfig.transition = transition;
	ReactSharedInternals19.T = transition;
	try {
		const result = scope();
		ReactSharedInternals19.S?.(transition, result);
	} finally {
		ReactSharedInternals18.ReactCurrentBatchConfig.transition = previous18;
		ReactSharedInternals19.T = previous19;
	}
}
/** Returns transition pending state and a function for starting transition work. */
export function useTransition(): readonly [boolean, (scope: () => void | Promise<void>) => void] {
	return resolveDispatcher().useTransition();
}
/** Returns a deferred copy of a value that may lag urgent rendering. */
export function useDeferredValue<T>(value: T, initialValue?: T): T {
	return resolveDispatcher().useDeferredValue(value, initialValue) as T;
}
/** Reads a supported promise or context, suspending when a promise is pending. */
export function use<T>(usable: PromiseLike<T> | ReactContext<T>): T {
	return resolveDispatcher().use(usable as PromiseLike<unknown> | ReactContext<unknown>) as T;
}
/** Couples an action with its latest state and pending status. */
export function useActionState<State, Payload>(
	action: (previousState: State, payload: Payload) => State | Promise<State>,
	initialState: State,
	_permalink?: string
): readonly [State, (payload: Payload) => void, boolean] {
	return resolveDispatcher().useActionState(
		action as (previous: unknown, payload: unknown) => unknown,
		initialState,
		_permalink
	) as readonly [State, (payload: Payload) => void, boolean];
}
/** Applies optimistic actions until the authoritative passthrough value changes. */
export function useOptimistic<State, Action = State>(
	passthrough: State,
	reducer?: (currentState: State, action: Action) => State
): readonly [State, (action: Action) => void] {
	return resolveDispatcher().useOptimistic(
		passthrough,
		reducer as ((state: unknown, action: unknown) => unknown) | undefined
	) as readonly [State, (action: Action) => void];
}
/** Returns a stable effect callback that always invokes the latest implementation. */
export function useEffectEvent<T extends (...args: any[]) => unknown>(implementation: T): T {
	return resolveDispatcher().useEffectEvent(implementation);
}
/** Memoizes a function result within the active React cache scope and argument path. */
export function cache<Args extends readonly unknown[], Result>(
	fn: (...args: Args) => Result
): (...args: Args) => Result {
	const identity = {};
	const fallbackRoot = new Map<unknown, unknown>();
	const createExternalRoot = () => new Map<unknown, unknown>();
	return (...args: Args): Result => {
		const externalRoot = ReactSharedInternals19.A?.getCacheForType?.(createExternalRoot);
		const scope = externalRoot ? undefined : activeReactCacheScope();
		let root = externalRoot ?? scope?.roots.get(identity);
		if (!root) {
			root = scope ? new Map<unknown, unknown>() : fallbackRoot;
			scope?.roots.set(identity, root);
		}
		let node = root;
		for (const argument of args) {
			let next = node.get(argument);
			if (!(next instanceof Map)) {
				next = new Map<unknown, unknown>();
				node.set(argument, next);
			}
			node = next as Map<unknown, unknown>;
		}
		const entry = node.get(cacheResultKey) as CacheEntry<Result> | undefined;
		if (entry) {
			if (entry.status === 'rejected') throw entry.value;
			return entry.value as Result;
		}
		try {
			const value = fn(...args);
			node.set(cacheResultKey, { status: 'fulfilled', value } satisfies CacheEntry<Result>);
			return value;
		} catch (error) {
			node.set(cacheResultKey, { status: 'rejected', value: error } satisfies CacheEntry<Result>);
			throw error;
		}
	};
}
const compatibilityCacheController = new AbortController();
/** Returns the abort signal associated with the active React cache scope. */
export function cacheSignal(): AbortSignal {
	return (
		ReactSharedInternals19.A?.cacheSignal?.() ??
		activeReactCacheScope()?.controller.signal ??
		compatibilityCacheController.signal
	);
}
/** Formats the current compatibility owner chain as a React-style component stack. */
export function captureOwnerStack(): string | null {
	let frame = currentReactOwnerFrame() as { type?: unknown; return?: unknown } | null;
	if (!frame) return null;
	const lines: string[] = [];
	while (frame) {
		const type = frame.type as { displayName?: string; name?: string } | string | symbol;
		const name =
			typeof type === 'string'
				? type
				: typeof type === 'symbol'
					? (type.description ?? 'Anonymous')
					: (type?.displayName ?? type?.name ?? 'Anonymous');
		lines.push(`\n    at ${name}`);
		frame = frame.return as typeof frame;
	}
	return lines.join('');
}
/** Reports that the experimental transition-type API is not implemented. */
export function addTransitionType(): never {
	throw new Error('React API addTransitionType is not supported by eXact compatibility');
}
/** Reports that the experimental cache-refresh hook is not implemented. */
export function unstable_useCacheRefresh(): never {
	throw new Error('React API unstable_useCacheRefresh is not supported by eXact compatibility');
}
/** Reports that the removed legacy factory API is not implemented. */
export function createFactory(): never {
	throw new Error('React API createFactory is not supported by eXact compatibility');
}
/** Runs a test interaction and flushes compatibility work until it settles. */
export async function act<T>(callback: () => T | Promise<T>): Promise<T> {
	type ActCallback = (didTimeout: boolean) => ActCallback | null;
	const target = reactCompatibilityTarget();
	const previous18 = ReactSharedInternals18.ReactCurrentActQueue.current as ActCallback[] | null;
	const previous19 = ReactSharedInternals19.actQueue as ActCallback[] | null;
	const previousBatching18 = ReactSharedInternals18.ReactCurrentActQueue.isBatchingLegacy;
	const previousBatching19 = ReactSharedInternals19.isBatchingLegacy;
	const existing = target === 18 ? previous18 : previous19;
	const queue = existing ?? [];
	const outermost = existing === null;
	if (target === 18) ReactSharedInternals18.ReactCurrentActQueue.current = queue;
	else ReactSharedInternals19.actQueue = queue;
	ReactSharedInternals18.ReactCurrentActQueue.isBatchingLegacy = true;
	ReactSharedInternals19.isBatchingLegacy = true;
	try {
		const result = await callback();
		if (outermost) {
			let stablePasses = 0;
			for (let pass = 0; pass < 100 && stablePasses < 2; pass++) {
				// Give concurrent work one cooperative pass, then force expired work
				// through on later passes so a scheduler deadline cannot starve act().
				flushCompatibilityActQueue(queue, pass > 0);
				flushSync();
				await Promise.resolve();
				stablePasses = queue.length === 0 ? stablePasses + 1 : 0;
			}
			if (queue.length)
				throw new Error('React compatibility act() did not settle after 100 flush passes');
		}
		return result;
	} finally {
		ReactSharedInternals18.ReactCurrentActQueue.current = previous18;
		ReactSharedInternals19.actQueue = previous19;
		ReactSharedInternals18.ReactCurrentActQueue.isBatchingLegacy = previousBatching18;
		ReactSharedInternals19.isBatchingLegacy = previousBatching19;
	}
}
export const unstable_act = act;

function flushCompatibilityActQueue(
	queue: Array<(didTimeout: boolean) => ((didTimeout: boolean) => unknown) | null>,
	didTimeout: boolean
): void {
	let index = 0;
	try {
		while (index < queue.length) {
			const callback = queue[index]!;
			const continuation = callback(didTimeout);
			if (typeof continuation === 'function') {
				queue[index] = continuation as (
					didTimeout: boolean
				) => ((didTimeout: boolean) => unknown) | null;
				if (index > 0) queue.splice(0, index);
				return;
			}
			index++;
		}
		queue.length = 0;
	} catch (error) {
		queue.splice(0, index + 1);
		throw error;
	}
}

/** Returns the currently selected React compatibility behavior level. */
export function compatibilityVersion(): 18 | 19 {
	return reactCompatibilityTarget();
}

function applyDefaultProps(type: unknown, props: Record<string, unknown>): void {
	if ((typeof type !== 'function' && typeof type !== 'object') || type === null) return;
	const defaults = (type as { defaultProps?: Record<string, unknown> }).defaultProps;
	if (!defaults) return;
	for (const [name, value] of Object.entries(defaults))
		if (props[name] === undefined) props[name] = value;
}

function childrenFrom(children: ReactNode | undefined): ReactNode[] {
	return children === undefined ? [] : Array.isArray(children) ? children : [children];
}

function flattenChildren(children: ReactNode, omitEmpty = true): ReactNode[] {
	const output: ReactNode[] = [];
	const visit = (value: ReactNode): void => {
		if (Array.isArray(value)) {
			for (const child of value) visit(child);
			return;
		}
		if (omitEmpty && (value === null || value === undefined || typeof value === 'boolean')) return;
		output.push(value);
	};
	visit(children);
	return output;
}

function classUpdater(instance: object): {
	setState(
		state: object | null | ((previous: unknown, props: unknown) => object | null),
		callback?: () => void
	): void;
	forceUpdate(callback?: () => void): void;
} {
	const updater = (instance as Record<PropertyKey, unknown>)[REACT_CLASS_UPDATER];
	if (!updater)
		throw new Error('Cannot update a React class component before it is mounted by eXact');
	return updater as ReturnType<typeof classUpdater>;
}

type LazyPayload<P> = {
	status: 'uninitialized' | 'pending' | 'fulfilled' | 'rejected';
	loader: () => Promise<{ default: ReactComponentType<P> }>;
	promise?: Promise<void>;
	value?: ReactComponentType<P>;
	error?: unknown;
};

function initializeLazy<P>(rawPayload: unknown): ReactComponentType<P> {
	const payload = rawPayload as LazyPayload<P>;
	if (payload.status === 'fulfilled') return payload.value!;
	if (payload.status === 'rejected') throw payload.error;
	if (payload.status === 'uninitialized') {
		payload.status = 'pending';
		payload.promise = Promise.resolve()
			.then(payload.loader)
			.then(
				(module) => {
					payload.status = 'fulfilled';
					payload.value = module.default;
				},
				(error) => {
					payload.status = 'rejected';
					payload.error = error;
				}
			);
	}
	throw payload.promise;
}

const cacheResultKey = Symbol('react.cache.result');
type CacheEntry<T> = { status: 'fulfilled' | 'rejected'; value: T | unknown };

const React = {
	__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
	__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
	Activity,
	Children,
	Component,
	Fragment,
	Profiler,
	PureComponent,
	StrictMode,
	Suspense,
	ViewTransition,
	act,
	addTransitionType,
	cache,
	cacheSignal,
	captureOwnerStack,
	cloneElement,
	createContext,
	createElement,
	createFactory,
	createRef,
	forwardRef,
	isValidElement,
	lazy,
	memo,
	startTransition,
	use,
	useActionState,
	useCallback,
	useContext,
	useDebugValue,
	useDeferredValue,
	useEffect,
	useEffectEvent,
	useId,
	useImperativeHandle,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useOptimistic,
	useReducer,
	useRef,
	useState,
	useSyncExternalStore,
	useTransition,
	unstable_act,
	unstable_useCacheRefresh,
	version
};

export default React;
