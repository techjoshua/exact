import {
	createElement,
	Component as ReactComponent,
	type ReactComponentType,
	type ReactNode
} from '@exact/react-compat';
import {
	matchRoutes as exactMatchRoutes,
	generatePath,
	matchPath,
	type ExactHydrationData,
	type ExactRouterSnapshot,
	type RouteLocation
} from '../core.js';
import { OutletContext, RouteErrorContext, RouteIdContext, type RouteObject } from './context.js';
import { parsePath } from './paths.js';
import { Router } from './routers.js';

export { createPath, createSearchParams, parsePath, resolvePath } from './paths.js';
/** Performs the match routes domain operation. */
export function matchRoutes(
	routes: readonly RouteObject[],
	location: string | Partial<RouteLocation>,
	basename = '/'
):
	| readonly {
			params: Readonly<Record<string, string>>;
			pathname: string;
			pathnameBase: string;
			route: RouteObject;
	  }[]
	| null {
	const pathname =
		typeof location === 'string'
			? (parsePath(location).pathname ?? '/')
			: (location.pathname ?? '/');
	const publicPath =
		basename === '/'
			? pathname
			: pathname.toLowerCase().startsWith(basename.toLowerCase())
				? pathname.slice(basename.length) || '/'
				: pathname;
	const matches = exactMatchRoutes(routes, publicPath);
	return matches.length
		? matches.map((match) => ({
				params: match.params,
				pathname: match.pathname,
				pathnameBase: match.pathnameBase,
				route: match.route
			}))
		: null;
}
/** Renders a precomputed match branch with optional data-router context. */
export function renderMatches(
	matches:
		| readonly {
				params: Readonly<Record<string, string>>;
				pathname: string;
				pathnameBase: string;
				route: RouteObject;
		  }[]
		| null
): ReactNode {
	if (!matches?.length) return null;
	let outlet: ReactNode = null;
	for (let index = matches.length - 1; index >= 0; index--) {
		const match = matches[index]!;
		const element: ReactNode = match.route.Component
			? createElement(match.route.Component, {})
			: (match.route.element ?? outlet);
		outlet = createElement(OutletContext.Provider, { value: outlet, children: element });
	}
	return outlet;
}
/** Provides routing backed by an externally supplied history implementation. */
export function unstable_HistoryRouter(props: {
	basename?: string;
	children?: ReactNode;
	history: any;
}): ReactNode {
	return createElement(Router, {
		basename: props.basename,
		location: props.history.location,
		navigationType: props.history.action,
		navigator: props.history,
		children: props.children
	});
}
/** Provides the canonical history router value. */
export const HistoryRouter = unstable_HistoryRouter;

export { generatePath, matchPath };
export type { ExactHydrationData };

/** Transforms route matches into its required representation. */
export function renderRouteMatches(snapshot: ExactRouterSnapshot<RouteObject>): ReactNode {
	if (!snapshot.matches.length) return null;
	const errorMatch = [...snapshot.matches]
		.reverse()
		.find((match) => snapshot.errors[match.id] !== undefined);
	if (errorMatch) {
		const errorIndex = snapshot.matches.indexOf(errorMatch);
		let boundaryIndex = -1;
		for (let index = errorIndex; index >= 0; index--) {
			const route = snapshot.matches[index]!.route;
			if (route.errorElement !== undefined || route.ErrorBoundary) {
				boundaryIndex = index;
				break;
			}
		}
		if (boundaryIndex >= 0) {
			const boundary = snapshot.matches[boundaryIndex]!;
			let outlet = routeProvider(
				boundary.id,
				createElement(RouteErrorContext.Provider, {
					value: { active: true, error: snapshot.errors[errorMatch.id] },
					children: boundary.route.ErrorBoundary
						? createElement(boundary.route.ErrorBoundary, {})
						: boundary.route.errorElement
				})
			);
			for (let index = boundaryIndex - 1; index >= 0; index--) {
				outlet = renderMatchedRoute(snapshot.matches[index]!, outlet, snapshot.location.key);
			}
			return outlet;
		}
	}
	let outlet: ReactNode = null;
	for (let index = snapshot.matches.length - 1; index >= 0; index--) {
		outlet = renderMatchedRoute(snapshot.matches[index]!, outlet, snapshot.location.key);
	}
	return outlet;
}

/** Transforms hydration fallback into its required representation. */
export function renderHydrationFallback(snapshot: ExactRouterSnapshot<RouteObject>): {
	found: boolean;
	node?: ReactNode;
} {
	let fallbackIndex = -1;
	for (let index = snapshot.matches.length - 1; index >= 0; index--) {
		const route = snapshot.matches[index]!.route;
		if (route.hydrateFallbackElement !== undefined || route.HydrateFallback) {
			fallbackIndex = index;
			break;
		}
	}
	if (fallbackIndex < 0) return { found: false };
	const route = snapshot.matches[fallbackIndex]!.route;
	let outlet = routeProvider(
		snapshot.matches[fallbackIndex]!.id,
		route.HydrateFallback ? createElement(route.HydrateFallback, {}) : route.hydrateFallbackElement
	);
	for (let index = fallbackIndex - 1; index >= 0; index--) {
		outlet = renderMatchedRoute(snapshot.matches[index]!, outlet, snapshot.location.key);
	}
	return { found: true, node: outlet };
}

function renderMatchedRoute(
	match: ExactRouterSnapshot<RouteObject>['matches'][number],
	outlet: ReactNode,
	locationKey: string
): ReactNode {
	const element: ReactNode = match.route.Component
		? createElement(match.route.Component, {})
		: (match.route.element ?? outlet);
	const rendered =
		match.route.ErrorBoundary || match.route.errorElement !== undefined
			? createElement(RouteRenderBoundary, {
					key: `${locationKey}:${match.id}`,
					ErrorBoundary: match.route.ErrorBoundary,
					errorElement: match.route.errorElement,
					children: element
				})
			: element;
	return createElement(OutletContext.Provider, {
		value: outlet,
		children: routeProvider(match.id, rendered)
	});
}

class RouteRenderBoundary extends ReactComponent<
	{
		ErrorBoundary?: ReactComponentType<any>;
		errorElement?: ReactNode;
		children?: ReactNode;
	},
	{ error?: unknown }
> {
	state: { error?: unknown } = {};
	static getDerivedStateFromError(error: unknown): { error: unknown } {
		return { error };
	}
	render(): ReactNode {
		if (!('error' in this.state)) return this.props.children;
		return createElement(RouteErrorContext.Provider, {
			value: { active: true, error: this.state.error },
			children: this.props.ErrorBoundary
				? createElement(this.props.ErrorBoundary, {})
				: this.props.errorElement
		});
	}
}

function routeProvider(id: string, children: ReactNode): ReactNode {
	return createElement(RouteIdContext.Provider, { value: id, children });
}
