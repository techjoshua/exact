import {
	createContext,
	createElement,
	useContext,
	useSyncExternalStore,
	type AnyReactComponentType,
	type ReactNode
} from '@exactjs/react-compat';
import { bridgeReactContext } from '@exactjs/react-compat/interop';
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

/** Configures navigate. */
export type NavigateOptions = NavigationOptions & {
	relative?: 'route' | 'path';
	preventScrollReset?: boolean;
};
/** Defines the route object type contract. */
export type RouteObject = Omit<ExactRouteDefinition, 'children' | 'lazy'> & {
	element?: ReactNode;
	Component?: AnyReactComponentType;
	errorElement?: ReactNode;
	ErrorBoundary?: AnyReactComponentType;
	hydrateFallbackElement?: ReactNode;
	HydrateFallback?: AnyReactComponentType;
	lazy?: () => Promise<Partial<Omit<RouteObject, 'children' | 'lazy'>>>;
	children?: readonly RouteObject[];
};
/** Defines the index route object type contract. */
export type IndexRouteObject = RouteObject & { index: true };
/** Defines the non index route object type contract. */
export type NonIndexRouteObject = RouteObject & { index?: false };
/** Defines the properties accepted by router provider. */
export type RouterProviderProps = {
	router: ExactRouter<RouteObject>;
	fallbackElement?: ReactNode;
};
/** Provides the canonical navigation type value. */
export const NavigationType = Object.freeze({
	Pop: 'POP',
	Push: 'PUSH',
	Replace: 'REPLACE'
} as const);
/** Carries the context required by static handler. */
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

/** Provides the canonical react router context value. */
export const ReactRouterContext = bridgeReactContext(
	RouterControllerContext,
	null as unknown as ExactRouter<ExactRouteDefinition>
);
/** Provides the canonical outlet context value. */
export const OutletContext = createContext<ReactNode>(null);
/** Provides the canonical outlet value context value. */
export const OutletValueContext = createContext<unknown>(undefined);
/** Provides the canonical route id context value. */
export const RouteIdContext = createContext<string | undefined>(undefined);
/** Provides the canonical route error context value. */
export const RouteErrorContext = createContext<Readonly<{ active: boolean; error?: unknown }>>({
	active: false
});
/** Provides the canonical route snapshot override context value. */
export const RouteSnapshotOverrideContext = createContext<
	ExactRouterSnapshot<RouteObject> | undefined
>(undefined);
/** Provides the canonical configured routes value. */
export const configuredRoutes = new WeakMap<ExactRouter<RouteObject>, unknown>();

/** Performs the use router domain operation. */
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

/** Performs the use snapshot domain operation. */
export function useSnapshot(router = useRouter()): ExactRouterSnapshot<RouteObject> {
	const snapshot = useSyncExternalStore(router.subscribe, router.getSnapshot, router.getSnapshot);
	return useContext(RouteSnapshotOverrideContext) ?? snapshot;
}

/** Performs the controller provider domain operation. */
export function ControllerProvider(props: {
	router: ExactRouter<RouteObject>;
	children?: ReactNode;
}): ReactNode {
	return createElement(ReactRouterContext.Provider, {
		value: props.router,
		children: props.children
	});
}

/** Creates a mode router. */
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
