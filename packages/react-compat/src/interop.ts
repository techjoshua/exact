import { createContext, type ComponentFunction, type ContextToken } from '@exactjs/core';
import {
	activeHookHost,
	assignReactRef,
	createReactContextForExactToken,
	EXACT_COMPONENT_TYPE
} from './internals.js';
import type { ReactComponentType, ReactContext, ReactNode, ReactRef } from './types.js';

/** Carries the context required by exact react interop. */
export interface ExactReactInteropContext<T> {
	/** Framework-neutral token used by native eXact components and adapters. */
	readonly exact: ContextToken<T>;
	/** React-compatible view backed by the exact same token identity. */
	readonly react: ReactContext<T>;
}

/** Creates a React context view over an existing native eXact context token. */
export function bridgeReactContext<T>(token: ContextToken<T>, defaultValue: T): ReactContext<T> {
	return createReactContextForExactToken(defaultValue, token);
}

/** Convenience API for packages that intentionally define both views together. */
export function defineInteropContext<T>(
	description: string,
	defaultValue: T,
	options: Readonly<{ global?: boolean; reactive?: boolean }> = {}
): ExactReactInteropContext<T> {
	const exact = createContext<T>(description, options);
	return Object.freeze({ exact, react: bridgeReactContext(exact, defaultValue) });
}

/** Reads a native eXact context from a component rendered by the React layer. */
export function useExactContext<T>(token: ContextToken<T>): T {
	return activeHookHost().exactContext(token);
}

/** Returns the shared native token for an explicitly bridged React context. */
export function exactContextToken<T>(context: ReactContext<T>): ContextToken<T> {
	if (context._exactContextMode !== 'value') {
		throw new TypeError(
			'React context was not created with bridgeReactContext or defineInteropContext'
		);
	}
	return context._exactToken as ContextToken<T>;
}

/**
 * Exposes a native component to rewritten React JSX through an explicit
 * boundary. The returned function is retained by normal ESM tree shaking and
 * is recognized structurally by the compatibility renderer.
 */
export function exposeExactComponent<
	P extends object,
	State extends object = Record<string, unknown>
>(
	component: ComponentFunction<State, P>,
	displayName = component.name || 'Anonymous',
	options: Readonly<{ refProp?: keyof P }> = {}
): ReactComponentType<P> {
	const boundary = function ExactComponentBoundary(_props: P): ReactNode {
		throw new Error('Native eXact component boundary must be rendered by @exactjs/react-compat');
	};
	Object.defineProperties(boundary, {
		name: { configurable: true, value: `ReactExact(${displayName})` },
		$$typeof: { value: EXACT_COMPONENT_TYPE },
		exactComponent: { value: component },
		exactRefProp: { value: options.refProp }
	});
	return boundary as ReactComponentType<P>;
}

/** Assigns a ref forwarded through an explicit native boundary refProp. */
export function assignExactBoundaryRef<T>(ref: ReactRef<T> | undefined, value: T | null): void {
	assignReactRef(ref, value);
}
