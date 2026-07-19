import {
	Children,
	createElement,
	isValidElement,
	useEffect,
	useMemo,
	useRef,
	type ReactNode
} from '@exact/react-compat';
import {
	createBrowserLocationSource,
	createExactRouter,
	createMemoryLocationSource,
	matchRoutes as exactMatchRoutes,
	type ExactHydrationData,
	type ExactRouter,
	type ExactRouterSnapshot,
	type RouteLocation
} from '../core.js';
import { browserWindowSource, readRouterHydrationData } from './browser.js';
import {
	configuredRoutes,
	ControllerProvider,
	createModeRouter,
	RouteSnapshotOverrideContext,
	useRouter,
	useSnapshot,
	type RouteObject,
	type RouterProviderProps
} from './context.js';
import { locationToString, parsePath, toNavigationValue, type To } from './paths.js';
import { renderHydrationFallback, renderRouteMatches } from './rendering.js';

export { createPath, createSearchParams, parsePath, resolvePath } from './paths.js';
export function BrowserRouter(props: {
	basename?: string;
	children?: ReactNode;
	window?: Window;
}): ReactNode {
	const router = useMemo(
		() =>
			createModeRouter(
				'history',
				props.basename,
				props.window ? browserWindowSource(props.window, 'history') : undefined
			),
		[]
	);
	useEffect(() => () => router.dispose(), [router]);
	return createElement(ControllerProvider, { router, children: props.children });
}

/** Provides declarative routing backed by the URL hash. */
export function HashRouter(props: {
	basename?: string;
	children?: ReactNode;
	window?: Window;
}): ReactNode {
	const router = useMemo(
		() =>
			createModeRouter(
				'hash',
				props.basename,
				props.window ? browserWindowSource(props.window, 'hash') : undefined
			),
		[]
	);
	useEffect(() => () => router.dispose(), [router]);
	return createElement(ControllerProvider, { router, children: props.children });
}

/** Provides declarative routing with an isolated in-memory history. */
export function MemoryRouter(props: {
	basename?: string;
	children?: ReactNode;
	initialEntries?: readonly (string | Partial<RouteLocation>)[];
	initialIndex?: number;
}): ReactNode {
	const router = useMemo(
		() =>
			createExactRouter<RouteObject>({
				source: createMemoryLocationSource(
					(props.initialEntries ?? ['/']).map((entry) =>
						typeof entry === 'string' ? entry : locationToString(entry)
					),
					props.initialIndex
				),
				basename: props.basename
			}),
		[]
	);
	useEffect(() => () => router.dispose(), [router]);
	return createElement(ControllerProvider, { router, children: props.children });
}

/** Provides routing from an externally controlled location and navigator. */
export function Router(props: {
	basename?: string;
	children?: ReactNode;
	location: string | Partial<RouteLocation>;
	navigationType?: 'POP' | 'PUSH' | 'REPLACE';
	navigator: {
		createHref?(to: To): string;
		push(to: To, state?: unknown): void;
		replace(to: To, state?: unknown): void;
		go(delta: number): void;
		listen?(listener: () => void): () => void;
	};
}): ReactNode {
	const location =
		typeof props.location === 'string' ? props.location : locationToString(props.location);
	const current = useRef({
		location,
		navigationType: props.navigationType,
		navigator: props.navigator
	});
	current.current = { location, navigationType: props.navigationType, navigator: props.navigator };
	const router = useMemo(
		() =>
			createExactRouter<RouteObject>({
				basename: props.basename,
				source: {
					location: () => new URL(current.current.location, 'http://exact.local'),
					push: (url, state) =>
						current.current.navigator.push(url.pathname + url.search + url.hash, state),
					replace: (url, state) =>
						current.current.navigator.replace(url.pathname + url.search + url.hash, state),
					go: (delta) => current.current.navigator.go(delta),
					subscribe: (listener) => current.current.navigator.listen?.(listener) ?? (() => {}),
					action: () => current.current.navigationType ?? 'POP'
				}
			}),
		[props.basename]
	);
	const synchronized = useRef({ location, navigationType: props.navigationType });
	if (
		synchronized.current.location !== location ||
		synchronized.current.navigationType !== props.navigationType
	) {
		synchronized.current = { location, navigationType: props.navigationType };
		router.sync(props.navigationType);
	}
	useEffect(() => () => router.dispose(), [router]);
	return createElement(ControllerProvider, { router, children: props.children });
}

/** Provides a non-navigating router for rendering a fixed server location. */
export function StaticRouter(props: {
	basename?: string;
	children?: ReactNode;
	location?: string | Partial<RouteLocation>;
}): ReactNode {
	return createElement(Router, {
		basename: props.basename,
		location: props.location ?? '/',
		navigator: {
			push() {},
			replace() {},
			go() {},
			createHref: (to: To) => toNavigationValue(to)
		},
		children: props.children
	});
}

/** Renders the best matching branch from nested Route elements. */
export function Routes(props: {
	children?: ReactNode;
	location?: string | Partial<RouteLocation>;
}): ReactNode {
	const routes = useMemo(() => createRoutesFromChildren(props.children), [props.children]);
	return useRoutes(routes, props.location);
}

/** Declarative marker inspected by Routes/createRoutesFromElements. */
/** Declares route configuration for a surrounding Routes component. */
export function Route(_props: RouteObject & { children?: ReactNode }): null {
	return null;
}

/** Converts nested Route elements and fragments into route objects. */
export function createRoutesFromChildren(children: ReactNode): RouteObject[] {
	const routes: RouteObject[] = [];
	for (const [index, child] of Children.toArray(children).entries()) {
		if (!isValidElement(child)) continue;
		if (child.type !== Route) throw new Error('Routes children must be Route elements');
		const props = child.props as RouteObject & { children?: ReactNode };
		const id = props.id ?? `route-${index}`;
		routes.push({
			...props,
			id,
			children: props.children === undefined ? undefined : createRoutesFromChildren(props.children)
		});
	}
	return routes;
}

export const createRoutesFromElements = createRoutesFromChildren;

/** Matches and renders route objects against the current or supplied location. */
export function useRoutes(
	routes: readonly RouteObject[],
	locationOverride?: string | Partial<RouteLocation>
): ReactNode {
	const router = useRouter();
	if (configuredRoutes.get(router) !== routes) {
		configuredRoutes.set(router, routes);
		router.setRoutes(routes);
	}
	const snapshot = useSnapshot(router);
	if (locationOverride === undefined) return renderRouteMatches(snapshot);
	const override: Partial<RouteLocation> =
		typeof locationOverride === 'string' ? parsePath(locationOverride) : locationOverride;
	const location: RouteLocation = {
		pathname: override.pathname ?? snapshot.location.pathname,
		search: override.search ?? '',
		hash: override.hash ?? '',
		state: 'state' in override ? override.state : undefined,
		key: override.key ?? `override:${locationToString(override)}`
	};
	const matches = exactMatchRoutes(routes, location.pathname);
	const projected: ExactRouterSnapshot<RouteObject> = {
		...snapshot,
		location,
		matches,
		params: Object.freeze({ ...(matches.at(-1)?.params ?? {}) })
	};
	return createElement(RouteSnapshotOverrideContext.Provider, {
		value: projected,
		children: renderRouteMatches(projected)
	});
}

/** Subscribes a component tree to a data router. */
export function RouterProvider(props: RouterProviderProps): ReactNode {
	const snapshot = useSnapshot(props.router);
	useEffect(() => {
		void props.router.initialize();
		return () => props.router.dispose();
	}, [props.router]);
	const fallback = snapshot.initialized ? undefined : renderHydrationFallback(snapshot);
	return createElement(ControllerProvider, {
		router: props.router,
		children: snapshot.initialized
			? renderRouteMatches(snapshot)
			: fallback?.found
				? fallback.node
				: (props.fallbackElement ?? null)
	});
}

/** Creates a data router backed by browser history. */
export function createBrowserRouter(
	routes: readonly RouteObject[],
	options: {
		basename?: string;
		hydrationData?: ExactHydrationData;
		hydrationKey?: string;
		window?: Window;
	} = {}
): ExactRouter<RouteObject> {
	const source = options.window
		? browserWindowSource(options.window, 'history')
		: createBrowserLocationSource('history');
	if (!source) throw new Error('createBrowserRouter requires a browser');
	return createExactRouter({
		source,
		routes,
		basename: options.basename,
		hydrationData:
			options.hydrationData ??
			readRouterHydrationData(source, routes, options.basename, 'history', options.hydrationKey)
	});
}

/** Creates a data router backed by hash history. */
export function createHashRouter(
	routes: readonly RouteObject[],
	options: {
		basename?: string;
		hydrationData?: ExactHydrationData;
		hydrationKey?: string;
		window?: Window;
	} = {}
): ExactRouter<RouteObject> {
	const source = options.window
		? browserWindowSource(options.window, 'hash')
		: createBrowserLocationSource('hash');
	if (!source) throw new Error('createHashRouter requires a browser');
	return createExactRouter({
		source,
		routes,
		basename: options.basename,
		mode: 'hash',
		hydrationData:
			options.hydrationData ??
			readRouterHydrationData(source, routes, options.basename, 'hash', options.hydrationKey)
	});
}

/** Creates a data router with deterministic in-memory history. */
export function createMemoryRouter(
	routes: readonly RouteObject[],
	options: {
		basename?: string;
		hydrationData?: ExactHydrationData;
		initialEntries?: readonly (string | Partial<RouteLocation>)[];
		initialIndex?: number;
	} = {}
): ExactRouter<RouteObject> {
	return createExactRouter({
		source: createMemoryLocationSource(
			(options.initialEntries ?? ['/']).map((entry) =>
				typeof entry === 'string' ? entry : locationToString(entry)
			),
			options.initialIndex
		),
		routes,
		basename: options.basename,
		hydrationData: options.hydrationData
	});
}

/** Renders the next matched child route and provides optional outlet context. */
