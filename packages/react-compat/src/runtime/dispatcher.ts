import type { HookHost } from '../internals.js';
import type { ReactContext } from '../types.js';
import { assignReactRef } from './refs.js';
import { REACT_CONTEXT_TYPE, type ReactDispatcher } from './shared.js';

export function createExactDispatcher(host: HookHost): ReactDispatcher {
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
