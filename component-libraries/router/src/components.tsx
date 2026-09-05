import {
	createContext,
	peek,
	type Child,
	type Component,
	type InteractionHandler
} from '@exactjs/core';
import { reactive } from '@exactjs/reactive';
import { getRequestContext, RequestContext, type RequestContextValue } from '@exactjs/request';
import { RouterControllerContext } from './context.js';
import {
	createBrowserLocationSource,
	createExactRouter,
	normalizeBasename,
	type ExactRouteDefinition,
	type ExactRouter,
	type LocationSource,
	type NavigationOptions,
	type RouteLocation,
	type RouteMatch,
	type RouterMode
} from './core.js';
import { createLinkClickHandler, navLinkActive } from './link-behavior.js';

export { RouterControllerContext } from './context.js';
export {
	createBrowserLocationSource,
	createExactRouter,
	createMemoryLocationSource,
	generatePath,
	hrefFor,
	hydrationDataFromSnapshot,
	hydrationEnvelopeFromSnapshot,
	locationValue,
	matchPath,
	matchRoutes,
	normalizeBasename,
	normalizePath,
	redirect,
	resolveTarget,
	routeUrl,
	stripBasename,
	toUrl
} from './core.js';
export type {
	CreateExactRouterOptions,
	ExactDataFunctionArgs,
	ExactHydrationData,
	ExactHydrationEnvelope,
	ExactLazyRoute,
	ExactRouteAction,
	ExactRouteDefinition,
	ExactRouteLoader,
	ExactRouter,
	ExactRouterSnapshot,
	FetcherSnapshot,
	HistoryAction,
	LocationSource,
	NavigationBlocker,
	NavigationOptions,
	RouteLocation,
	RouteMatch,
	RouterMode
} from './core.js';
/** Defines the route context value type contract. */
export type RouteContextValue = {
	router: ExactRouter<RouteRecord>;
	location: RouteLocation;
	params: Readonly<Record<string, string>>;
	matches: readonly RouteMatch[];
	basename: string;
	navigate(to: string | URL, options?: NavigationOptions): void;
	href(to: string | URL): string;
	searchParams(): URLSearchParams;
};

/** Provides the canonical route context value. */
export const RouteContext = createContext<RouteContextValue>('exact.route', true);

/** Defines the properties accepted by router. */
export type RouterProps = {
	mode?: RouterMode;
	basename?: string;
	source?: LocationSource;
	routes: readonly RouteDefinition[];
};

type RouterState = { version: number };

/** Performs the router domain operation. */
export function Router(this: Component<RouterState>, props: RouterProps) {
	this.state.version = 0;
	const mode = peek(() => props.mode ?? 'history');
	const basename = peek(() => normalizeBasename(props.basename));
	const request = componentRequestContext(this) ?? getRequestContext();
	if (request) this.setContext(RequestContext, request);
	const source = peek(
		() => props.source ?? requestSource(request) ?? createBrowserLocationSource(mode)
	);
	if (!source)
		throw new Error(
			'Router requires a location source outside a browser or ambient request context'
		);
	const routes = peek(() => normalizeRouteDefinitions(props.routes));
	const controller = createExactRouter({ source, routes, basename, mode });
	const routeContext = peek(() => reactive(routeContextValue(controller, basename)));
	this.setContext(RouteContext, routeContext);
	this.setContext(RouterControllerContext, controller);

	const refresh = () => {
		// Publish the accepted snapshot through the reactive context before rendering the new
		// branch. Long-lived consumers such as navigation shells then update with that branch.
		routeContext.version++;
		this.state.version++;
	};
	let unsubscribe: (() => void) | undefined;
	this.onMount(() => {
		unsubscribe = controller.subscribe(refresh);
	});
	this.onUnmount(() => {
		unsubscribe?.();
		controller.dispose();
	});

	return () => routerBranch(controller, this.state.version);
}

/** Creates a reactive route context whose public getters follow the accepted router snapshot. */
function routeContextValue(
	controller: ExactRouter<RouteRecord>,
	basename: string
): RouteContextValue & { version: number } {
	return {
		version: 0,
		router: controller,
		get location() {
			void this.version;
			return controller.getSnapshot().location;
		},
		get params() {
			void this.version;
			return controller.getSnapshot().params;
		},
		get matches() {
			void this.version;
			return controller.getSnapshot().matches;
		},
		basename,
		navigate: (to, options) => {
			void controller.navigate(to, options);
		},
		href: (to) => controller.createHref(to),
		searchParams: () => new URLSearchParams(controller.getSnapshot().location.search)
	};
}

/** Defines the properties accepted by route. */
export type RouteDefinition = {
	path?: string;
	index?: boolean;
	caseSensitive?: boolean;
	/** Supplies compiler-classified route output around the already-composed nested outlet. */
	render?: (outlet: Child) => Child;
	children?: readonly RouteDefinition[];
};

type RouteRecord = Omit<RouteDefinition, 'children'> &
	ExactRouteDefinition & { children: RouteRecord[] };

function normalizeRouteDefinitions(
	routes: readonly RouteDefinition[],
	parentId = 'root'
): RouteRecord[] {
	return routes.map((route, index) => {
		const id = `${parentId}.${index}`;
		return {
			...route,
			id,
			children: normalizeRouteDefinitions(route.children ?? [], id)
		};
	});
}

function renderBranch(routes: RouteRecord[]): Child {
	let outlet: Child = null;
	for (let index = routes.length - 1; index >= 0; index--) {
		const route = routes[index]!;
		outlet = route.render?.(outlet) ?? outlet;
	}
	return outlet;
}

/**
 * Projects the current matched branch for one reactive router version.
 * @exact pure
 */
function routerBranch(controller: ExactRouter<RouteRecord>, _version: number): Child {
	const matches = controller.getSnapshot().matches;
	return matches.length ? renderBranch(matches.map((match) => match.route)) : null;
}

/** Defines the properties accepted by link. */
export type LinkProps = Record<string, unknown> & {
	to: string | URL;
	replace?: boolean;
	state?: unknown;
	children?: Child | Child[];
	onClick?: InteractionHandler<[event: MouseEvent]>;
};

/** Performs the link domain operation. */
export function Link(this: Component<{}>, props: LinkProps) {
	const route = this.getContext(RouteContext);
	const click = peek(() => createLinkClickHandler(this, route, props));
	const { to, replace: _replace, state: _state, children, onClick: _onClick, ...rest } = props;
	return () => (
		<a {...rest} href={route.href(to)} onClick={click}>
			{children}
		</a>
	);
}

/** Defines the properties accepted by nav link. */
export type NavLinkProps = LinkProps & {
	end?: boolean;
	className?: string | ((active: boolean) => string);
};
/** Performs the nav link domain operation. */
export function NavLink(this: Component<{}>, props: NavLinkProps) {
	const route = this.getContext(RouteContext);
	const click = peek(() => createLinkClickHandler(this, route, props));
	const active = this.reactive(() => {
		void route.location;
		void props.to;
		void props.end;
		return peek(() => navLinkActive(route, props));
	});
	const {
		to,
		end: _end,
		className: _className,
		replace: _replace,
		state: _state,
		children,
		onClick: _onClick,
		...rest
	} = props;
	return () => (
		<a
			{...rest}
			href={route.href(to)}
			onClick={click}
			className={
				typeof props.className === 'function' ? props.className(active.get()) : props.className
			}
			aria-current={active.get() ? 'page' : undefined}
		>
			{children}
		</a>
	);
}

/** Performs the navigate domain operation. */
export function Navigate(
	this: Component<{}>,
	props: { to: string | URL; replace?: boolean; status?: number }
) {
	const route = this.getContext(RouteContext);
	route.navigate(props.to, { replace: props.replace ?? true, status: props.status });
	return null;
}

function requestSource(request: RequestContextValue | undefined): LocationSource | undefined {
	if (!request) return undefined;
	return {
		location: () => request.url,
		push: (url, _state, status) => request.redirect?.(url, status ?? 302),
		replace: (url, _state, status) => request.redirect?.(url, status ?? 302),
		action: () => 'POP',
		key: () => 'request'
	};
}

function componentRequestContext(component: Component<object>): RequestContextValue | undefined {
	try {
		return component.getContext(RequestContext);
	} catch {
		return undefined;
	}
}
