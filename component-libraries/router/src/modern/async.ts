import { createContext, createElement, useContext, type ReactNode } from '@exactjs/react-compat';
import { isPromiseLike } from './browser.js';

export { createPath, createSearchParams, parsePath, resolvePath } from './paths.js';

/** Provides the canonical async value context value. */
export const AsyncValueContext = createContext<unknown>(undefined);
/** Provides the canonical async error context value. */
export const AsyncErrorContext = createContext<unknown>(undefined);
type AwaitedValueState = {
	status: 'pending' | 'fulfilled' | 'rejected';
	value?: unknown;
	error?: unknown;
};
const awaitedValues = new WeakMap<object, AwaitedValueState>();
/** Renders resolved deferred data or suspends while the supplied promise settles. */
export function Await(props: {
	resolve: unknown;
	errorElement?: ReactNode;
	children?: ReactNode | ((value: unknown) => ReactNode);
}): ReactNode {
	let value = props.resolve;
	if (isPromiseLike(value)) {
		let state = awaitedValues.get(value);
		if (!state) {
			state = { status: 'pending' };
			awaitedValues.set(value, state);
			void Promise.resolve(value).then(
				(result) => {
					state!.status = 'fulfilled';
					state!.value = result;
				},
				(error) => {
					state!.status = 'rejected';
					state!.error = error;
				}
			);
		}
		if (state.status === 'pending') throw value;
		if (state.status === 'rejected') {
			if (props.errorElement === undefined) throw state.error;
			return createElement(AsyncErrorContext.Provider, {
				value: state.error,
				children: props.errorElement
			});
		}
		value = state.value;
	}
	const children = typeof props.children === 'function' ? props.children(value) : props.children;
	return createElement(AsyncValueContext.Provider, { value, children });
}
/** Reads the resolved value provided by the nearest Await boundary. */
export function useAsyncValue<T = unknown>(): T {
	return useContext(AsyncValueContext) as T;
}
/** Reads the rejection provided by the nearest Await boundary. */
export function useAsyncError(): unknown {
	return useContext(AsyncErrorContext);
}
/** Matches route objects against a location without rendering them. */
