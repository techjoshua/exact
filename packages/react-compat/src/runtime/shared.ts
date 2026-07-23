import { createContext as createExactContext, type ContextToken } from '@exactjs/core';
import type { ExactProfileEvent, ExactProfileSink } from '@exactjs/instrumentation';
import type {
	DependencyList,
	ExternalStoreSubscribe,
	ReactContext,
	ReactElement,
	ReactRef
} from '../types.js';
import { type ContextCell } from './hook-slots.js';

export { toExactNode } from './nodes.js';
export { assignReactRef } from './refs.js';

/** Provides the canonical react element 18 value. */
export const REACT_ELEMENT_18 = Symbol.for('react.element');
/** Provides the canonical react element 19 value. */
export const REACT_ELEMENT_19 = Symbol.for('react.transitional.element');
/** Provides the canonical react fragment type value. */
export const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
/** Provides the canonical react forward ref type value. */
export const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
/** Provides the canonical react memo type value. */
export const REACT_MEMO_TYPE = Symbol.for('react.memo');
/** Provides the canonical react lazy type value. */
export const REACT_LAZY_TYPE = Symbol.for('react.lazy');
/** Provides the canonical react context type value. */
export const REACT_CONTEXT_TYPE = Symbol.for('react.context');
/** Provides the canonical react provider type value. */
export const REACT_PROVIDER_TYPE = Symbol.for('react.provider');
/** Provides the canonical react consumer type value. */
export const REACT_CONSUMER_TYPE = Symbol.for('react.consumer');
/** Provides the canonical react strict mode type value. */
export const REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode');
/** Provides the canonical react profiler type value. */
export const REACT_PROFILER_TYPE = Symbol.for('react.profiler');
/** Provides the canonical react suspense type value. */
export const REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
/** Provides the canonical react portal type value. */
export const REACT_PORTAL_TYPE = Symbol.for('react.portal');
/** Provides the canonical react activity type value. */
export const REACT_ACTIVITY_TYPE = Symbol.for('react.activity');
/** Provides the canonical react class updater value. */
export const REACT_CLASS_UPDATER = Symbol.for('exact.react.class-updater');
/** Provides the canonical exact component type value. */
export const EXACT_COMPONENT_TYPE = Symbol.for('exact.react.native-component');

/** Provides the canonical react ref prop value. */
export const REACT_REF_PROP = '__exactReactCompatibilityRef';

let target: 18 | 19 = 19;

/** Reports an observable react compatibility profile event. */
export type ReactCompatibilityProfileEvent = ExactProfileEvent<'react-compat', 'render' | 'commit'>;
/** Provides the canonical profile stack value. */
export const profileStack: ExactProfileSink<ReactCompatibilityProfileEvent>[] = [];
let nextCompatibilityId = 1;

/** Allocates an identifier shared by contexts and hook hosts. */
export function nextReactCompatibilityId(): number {
	return nextCompatibilityId++;
}

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

/** Applies a react compatibility target to the owned runtime state. */
export function setReactCompatibilityTarget(next: 18 | 19): void {
	target = next;
}
/** Performs the react compatibility target domain operation. */
export function reactCompatibilityTarget(): 18 | 19 {
	return target;
}
/** Performs the react element symbol domain operation. */
export function reactElementSymbol(): symbol {
	return target === 18 ? REACT_ELEMENT_18 : REACT_ELEMENT_19;
}

/** Reports whether react element. */
export function isReactElement(value: unknown): value is ReactElement {
	if (!value || typeof value !== 'object') return false;
	const marker = (value as { $$typeof?: unknown }).$$typeof;
	return marker === REACT_ELEMENT_18 || marker === REACT_ELEMENT_19;
}

/** Creates a react context. */
export function createReactContext<T>(defaultValue: T): ReactContext<T> {
	const token = createExactContext<ContextCell>(`react.compat.${nextReactCompatibilityId()}`);
	return createReactContextObject(defaultValue, token, 'cell');
}

/** Creates a react context for exact token. */
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

/** Defines the react dispatcher type contract. */
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

/** Defines the react async dispatcher type contract. */
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

/** Provides the canonical react shared internals18 value. */
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

/** Provides the canonical react shared internals19 value. */
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

/** Resolves a dispatcher. */
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

/** Applies a current dispatcher to the owned runtime state. */
export function setCurrentDispatcher(dispatcher: ReactDispatcher | null): ReactDispatcher | null {
	if (target === 18) {
		const previous = ReactSharedInternals18.ReactCurrentDispatcher.current;
		ReactSharedInternals18.ReactCurrentDispatcher.current = dispatcher;
		return previous;
	}
	const previous = ReactSharedInternals19.H;
	ReactSharedInternals19.H = dispatcher;
	return previous;
}

/** Defines the react cache scope type contract. */
export type ReactCacheScope = {
	roots: Map<object, Map<unknown, unknown>>;
	controller: AbortController;
};

/** Defines the react root runtime type contract. */
export type ReactRootRuntime = {
	identifierPrefix: string;
	nextComponentId: number;
	onCaughtError?: (
		error: unknown,
		info: { componentStack: string; errorBoundary?: unknown }
	) => void;
	resources?: Map<string, { priority: number; html: string }>;
};

/** Provides the canonical react cache context value. */
export const ReactCacheContext = createExactContext<ReactCacheScope>('react.cache', true);
/** Provides the canonical react root context value. */
export const ReactRootContext = createExactContext<ReactRootRuntime>('react.root', true);
/** Provides the canonical legacy react context value. */
export const LegacyReactContext =
	createExactContext<Record<string, unknown>>('react.legacy-context');
