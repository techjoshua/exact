import {
	createReactContext,
	REACT_FORWARD_REF_TYPE,
	REACT_LAZY_TYPE,
	REACT_MEMO_TYPE
} from '../internals.js';
import type { MutableRefObject, ReactComponentType, ReactContext, ReactNode } from '../types.js';

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
