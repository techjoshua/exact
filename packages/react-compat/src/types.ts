/** Defines the key type contract. */
export type Key = string | number | bigint;
/** Defines the react text type contract. */
export type ReactText = string | number;
/** Defines the react node type contract. */
export type ReactNode =
	| ReactElement
	| ReactPortal
	| ReactText
	| bigint
	| boolean
	| null
	| undefined
	| ReactNode[]
	| Promise<ReactNode>
	| object;
/** Defines the react component type type contract. */
export type ReactComponentType<P = Record<string, unknown>> =
	| ((props: P) => ReactNode)
	| ReactClassType<P>
	| ReactSpecialType<P>;

/** Existential React component accepted by compatibility internals that forward props opaquely. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- React component props are contravariant and must retain DefinitelyTyped-compatible permissiveness at this boundary.
export type AnyReactComponentType = ReactComponentType<any>;

/** Opaque mutable class value retained to match React's intentionally permissive class API. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- React class state supports arbitrary property access and updater inference in compatibility-authored code.
type ReactClassState = any;

/** Component values accepted by the compatibility element pipeline. */
export type ReactCompatibleComponentType<P = Record<string, unknown>> =
	| ReactComponentType<P>
	| ComponentFunction<ReactClassState, P>;

/** Defines the react class type interface contract. */
export interface ReactClassType<P = Record<string, unknown>> {
	new (props: P, context?: unknown): ReactClassInstance<P>;
	readonly contextType?: ReactContext<unknown>;
	readonly contextTypes?: Record<string, unknown>;
	readonly childContextTypes?: Record<string, unknown>;
	readonly defaultProps?: Partial<P>;
	readonly getDerivedStateFromProps?: (props: P, state: unknown) => object | null;
	readonly getDerivedStateFromError?: (error: unknown) => object | null;
	readonly displayName?: string;
}

/** Defines the react class instance interface contract. */
export interface ReactClassInstance<P = Record<string, unknown>> {
	props: P;
	state: ReactClassState;
	context: unknown;
	refs: Record<string, unknown>;
	render(): ReactNode;
	setState(
		state: object | null | ((previous: ReactClassState, props: P) => object | null),
		callback?: () => void
	): void;
	forceUpdate(callback?: () => void): void;
	shouldComponentUpdate?(nextProps: P, nextState: ReactClassState, nextContext: unknown): boolean;
	componentDidMount?(): void;
	componentDidUpdate?(previousProps: P, previousState: ReactClassState, snapshot?: unknown): void;
	componentWillUnmount?(): void;
	componentDidCatch?(error: unknown, info: { componentStack: string }): void;
	getSnapshotBeforeUpdate?(previousProps: P, previousState: ReactClassState): unknown;
	getChildContext?(): Record<string, unknown>;
}

/** Defines the react element interface contract. */
export interface ReactElement<P = Record<string, unknown>> {
	readonly $$typeof: symbol;
	readonly type: string | symbol | ReactCompatibleComponentType<P>;
	readonly key: string | null;
	readonly ref: unknown;
	readonly props: P & { children?: ReactNode };
	readonly _owner: unknown;
	readonly _store?: { validated: number };
	readonly _debugInfo?: unknown;
}

/** Defines the react portal interface contract. */
export interface ReactPortal {
	readonly $$typeof: symbol;
	readonly key: string | null;
	readonly children: ReactNode;
	readonly containerInfo: unknown;
	readonly implementation: null;
}

/** Defines the react special type interface contract. */
export interface ReactSpecialType<P = Record<string, unknown>> {
	readonly $$typeof: symbol;
	readonly type?: ReactComponentType<P>;
	readonly render?: (props: P, ref: unknown) => ReactNode;
	readonly _payload?: unknown;
	readonly _init?: (payload: unknown) => unknown;
	readonly compare?: ((previous: P, next: P) => boolean) | null;
}

/** Defines the mutable ref object interface contract. */
export interface MutableRefObject<T> {
	current: T;
}
/** Defines the dispatch type contract. */
export type Dispatch<A> = (value: A) => void;
/** Defines the set state action type contract. */
export type SetStateAction<S> = S | ((previous: S) => S);
/** Defines the reducer type contract. */
export type Reducer<S, A> = (previous: S, action: A) => S;
/** Defines the dependency list type contract. */
export type DependencyList = readonly unknown[];

/** Defines the react ref type contract. */
export type ReactRef<T> =
	| ((value: T | null) => void | (() => void))
	| MutableRefObject<T | null>
	| null;

/** Carries the context required by react. */
export interface ReactContext<T> {
	readonly $$typeof: symbol;
	readonly Provider: ReactComponentType<{ value: T; children?: ReactNode }>;
	readonly Consumer: ReactComponentType<{ children: (value: T) => ReactNode }>;
	readonly _defaultValue: T;
	_currentValue: T;
	_currentValue2: T;
	_threadCount: number;
	_currentRenderer?: object | null;
	_currentRenderer2?: object | null;
	readonly _exactToken: unknown;
	readonly _exactContextMode?: 'cell' | 'value';
}

/** Defines the external store subscribe type contract. */
export type ExternalStoreSubscribe = (onStoreChange: () => void) => () => void;
import type { ComponentFunction } from '@exactjs/core';
