import { ReactSharedInternals18, ReactSharedInternals19, resolveDispatcher } from '../internals.js';
import type {
	DependencyList,
	Dispatch,
	MutableRefObject,
	ReactContext,
	ReactRef,
	Reducer,
	SetStateAction
} from '../types.js';

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
