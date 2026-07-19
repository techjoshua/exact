import {
	createContext,
	createElement,
	useContext,
	useSyncExternalStore,
	type ReactComponentType,
	type ReactNode
} from '@exact/react-compat';
import { bridgeReactContext } from '@exact/react-compat/interop';
import { RouterControllerContext } from '../context.js';
import {
	createExactRouter,
	type ExactRouteDefinition,
	type ExactRouter,
	type ExactRouterSnapshot,
	type LocationSource,
	type NavigationOptions,
	type RouteLocation,
	type RouterMode
} from '../core.js';
import { createBrowserLocationSource } from '../core.js';

export type NavigateOptions = NavigationOptions & {
	relative?: 'route' | 'path';
	preventScrollReset?: boolean;
};
export type RouteObject = Omit<ExactRouteDefinition, 'children' | 'lazy'> & {
	element?: ReactNode;
	Component?: ReactComponentType<any>;
	errorElement?: ReactNode;
	ErrorBoundary?: ReactComponentType<any>;
	hydrateFallbackElement?: ReactNode;
	HydrateFallback?: ReactComponentType<any>;
	lazy?: () => Promise<Partial<Omit<RouteObject, 'children' | 'lazy'>>>;
	children?: readonly RouteObject[];
};
export type IndexRouteObject = RouteObject & { index: true };
export type NonIndexRouteObject = RouteObject & { index?: false };
export type RouterProviderProps = {
	router: ExactRouter<RouteObject>;
	fallbackElement?: ReactNode;
};
export const NavigationType = Object.freeze({
	Pop: 'POP',
	Push: 'PUSH',
	Replace: 'REPLACE'
} as const);
export type StaticHandlerContext = Readonly<{
	location: RouteLocation;
	matches: ExactRouterSnapshot<RouteObject>['matches'];
	loaderData: Readonly<Record<string, unknown>>;
	actionData: Readonly<Record<string, unknown>>;
	errors: Readonly<Record<string, unknown>>;
	statusCode: number;
	loaderHeaders: Readonly<Record<string, Headers>>;
	actionHeaders: Readonly<Record<string, Headers>>;
}>;

export const ReactRouterContext = bridgeReactContext(
	RouterControllerContext,
	null as unknown as ExactRouter<ExactRouteDefinition>
);
export const OutletContext = createContext<ReactNode>(null);
export const OutletValueContext = createContext<unknown>(undefined);
export const RouteIdContext = createContext<string | undefined>(undefined);
export const RouteErrorContext = createContext<Readonly<{ active: boolean; error?: unknown }>>({
	active: false
});
export const RouteSnapshotOverrideContext = createContext<
	ExactRouterSnapshot<RouteObject> | undefined
>(undefined);
export const configuredRoutes = new WeakMap<ExactRouter<any>, unknown>();

export function useRouter(): ExactRouter<RouteObject> {
	const router = useContext(ReactRouterContext);
	if (!router) throw new Error('React Router compatibility APIs must be rendered inside a router');
	return router as ExactRouter<RouteObject>;
}
/** Returns whether the current component is rendered beneath an eXact router provider. */
export function useInRouterContext(): boolean {
	return !!useContext(ReactRouterContext);
}

/** Renderer bridge used by versioned facades in this package, not a React Router public export. */
/** Exposes the underlying eXact router for compatibility integrations. */
export function UNSAFE_useExactRouter(): ExactRouter<RouteObject> {
	return useRouter();
}

export function useSnapshot(router = useRouter()): ExactRouterSnapshot<RouteObject> {
	const snapshot = useSyncExternalStore(router.subscribe, router.getSnapshot, router.getSnapshot);
	return useContext(RouteSnapshotOverrideContext) ?? snapshot;
}

export function ControllerProvider(props: {
	router: ExactRouter<RouteObject>;
	children?: ReactNode;
}): ReactNode {
	return createElement(ReactRouterContext.Provider, {
		value: props.router,
		children: props.children
	});
}

export function createModeRouter(
	mode: RouterMode,
	basename: string | undefined,
	source?: LocationSource
): ExactRouter<RouteObject> {
	const resolved = source ?? createBrowserLocationSource(mode);
	if (!resolved)
		throw new Error(`${mode === 'hash' ? 'HashRouter' : 'BrowserRouter'} requires a browser`);
	return createExactRouter<RouteObject>({ source: resolved, basename, mode });
}

/** Provides declarative routing backed by browser history. */
