export type Key = string | number | bigint;
export type ReactText = string | number;
export type ReactNode =
	| ReactElement
	| ReactPortal
	| ReactText
	| boolean
	| null
	| undefined
	| ReactNode[]
	| object;
export type ReactComponentType<P = Record<string, unknown>> =
	| ((props: P) => ReactNode)
	| ReactClassType<P>
	| ReactSpecialType<P>;

export interface ReactClassType<P = Record<string, unknown>> {
	new (props: P, context?: unknown): ReactClassInstance<P>;
	readonly contextType?: ReactContext<any>;
	readonly contextTypes?: Record<string, unknown>;
	readonly childContextTypes?: Record<string, unknown>;
	readonly defaultProps?: Partial<P>;
	readonly getDerivedStateFromProps?: (props: P, state: unknown) => object | null;
	readonly getDerivedStateFromError?: (error: any) => object | null;
	readonly displayName?: string;
}

export interface ReactClassInstance<P = Record<string, unknown>> {
	props: P;
	state: any;
	context: unknown;
	refs: Record<string, unknown>;
	render(): ReactNode;
	setState(
		state: object | null | ((previous: any, props: P) => object | null),
		callback?: () => void
	): void;
	forceUpdate(callback?: () => void): void;
	shouldComponentUpdate?(nextProps: P, nextState: any, nextContext: unknown): boolean;
	componentDidMount?(): void;
	componentDidUpdate?(previousProps: P, previousState: any, snapshot?: unknown): void;
	componentWillUnmount?(): void;
	componentDidCatch?(error: unknown, info: { componentStack: string }): void;
	getSnapshotBeforeUpdate?(previousProps: P, previousState: any): unknown;
	getChildContext?(): Record<string, unknown>;
}

export interface ReactElement<P = Record<string, unknown>> {
	readonly $$typeof: symbol;
	readonly type: string | symbol | ReactComponentType<P>;
	readonly key: string | null;
	readonly ref: unknown;
	readonly props: P & { children?: ReactNode };
	readonly _owner: unknown;
	readonly _store?: { validated: number };
	readonly _debugInfo?: unknown;
}

export interface ReactPortal {
	readonly $$typeof: symbol;
	readonly key: string | null;
	readonly children: ReactNode;
	readonly containerInfo: unknown;
	readonly implementation: null;
}

export interface ReactSpecialType<P = Record<string, unknown>> {
	readonly $$typeof: symbol;
	readonly type?: ReactComponentType<P>;
	readonly render?: (props: P, ref: unknown) => ReactNode;
	readonly _payload?: unknown;
	readonly _init?: (payload: unknown) => unknown;
	readonly compare?: ((previous: P, next: P) => boolean) | null;
}

export interface MutableRefObject<T> {
	current: T;
}
export type Dispatch<A> = (value: A) => void;
export type SetStateAction<S> = S | ((previous: S) => S);
export type Reducer<S, A> = (previous: S, action: A) => S;
export type DependencyList = readonly unknown[];

export type ReactRef<T> =
	| ((value: T | null) => void | (() => void))
	| MutableRefObject<T | null>
	| null;

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

export type ExternalStoreSubscribe = (onStoreChange: () => void) => () => void;
