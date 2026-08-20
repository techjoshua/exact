import {
	createContext,
	createVNode,
	Dynamic,
	Fragment,
	peek,
	unwrap,
	type Child,
	type Component,
	type AuthoredComponentFunction,
	type ComponentFunction,
	type InteractionHandler,
	type VNode
} from '@exactjs/core';
import { getCellVNode, isCellVNode } from '@exactjs/core/runtime/render';
import { markExactComponent } from '@exactjs/core/framework/component-contracts';
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
type OutletContextValue = { readonly current: Child | Child[] | undefined };
const OutletContext = createContext<OutletContextValue>('exact.route.outlet', {
	reactive: false
});

/** Defines the properties accepted by router. */
export type RouterProps = {
	mode?: RouterMode;
	basename?: string;
	source?: LocationSource;
	children?: Child | Child[];
};

type RouterState = { version: number };

/** Performs the router domain operation. */
export function Router(this: Component<RouterState>, props: RouterProps) {
	this.state.version = 0;
	const mode = props.mode ?? 'history';
	const basename = normalizeBasename(props.basename);
	const request = componentRequestContext(this) ?? getRequestContext();
	if (request) this.setContext(RequestContext, request);
	const source = props.source ?? requestSource(request) ?? createBrowserLocationSource(mode);
	if (!source)
		throw new Error(
			'Router requires a location source outside a browser or ambient request context'
		);
	const routes = routeChildren(props.children);
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

	return () => routerBranch(controller, routeContext, this.state.version);
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
export type RouteProps = {
	path?: string;
	index?: boolean;
	caseSensitive?: boolean;
	component?: AuthoredComponentFunction<any, any>;
	componentProps?: Record<string, unknown>;
	children?: Child | Child[];
};

/** Declarative route marker consumed by Router; it does not render independently. */
export function Route(_props: RouteProps): null {
	return null;
}

// The compiler preserves function identity while normalizing Route's direct result to a render
// closure. VNodes therefore carry this same value under the canonical runtime component type.
const RouteComponent = Route as unknown as ComponentFunction<Record<string, never>, RouteProps>;

type RouteRecord = RouteProps & ExactRouteDefinition & { children: RouteRecord[] };

function routeChildren(children: Child | Child[] | undefined, parentId = 'root'): RouteRecord[] {
	const values = Array.isArray(children) ? children : children === undefined ? [] : [children];
	const output: RouteRecord[] = [];
	const collect = (value: Child) => {
		if (Array.isArray(value)) {
			for (const child of value) collect(child);
			return;
		}
		const vnode = unwrapCell(value);
		if (!vnode) return;
		if (vnode.type === Dynamic) {
			const resolved = unwrap(vnode.props.value) as Child | Child[];
			if (Array.isArray(resolved)) for (const child of resolved) collect(child);
			else collect(resolved);
			return;
		}
		if (vnode.type === Fragment) {
			for (const child of vnode.children) collect(child);
			return;
		}
		if (vnode.type !== RouteComponent) return;
		const rawProps = vnode.props as RouteProps;
		const props: RouteProps = {
			...rawProps,
			...(rawProps.path !== undefined ? { path: unwrap(rawProps.path) as string } : {}),
			...(rawProps.index !== undefined ? { index: unwrap(rawProps.index) as boolean } : {}),
			...(rawProps.caseSensitive !== undefined
				? { caseSensitive: unwrap(rawProps.caseSensitive) as boolean }
				: {}),
			...(rawProps.component !== undefined
				? { component: unwrap(rawProps.component) as AuthoredComponentFunction<any, any> }
				: {}),
			...(rawProps.componentProps !== undefined
				? {
						componentProps: unwrap(rawProps.componentProps) as Record<string, unknown>
					}
				: {})
		};
		const id = `${parentId}.${output.length}`;
		const children = routeChildren(vnode.children.length ? vnode.children : props.children, id);
		output.push({ ...props, id, children });
	};
	for (const value of values) collect(value);
	return output;
}

function unwrapCell(value: Child): VNode | undefined {
	if (!value || typeof value !== 'object') return undefined;
	let vnode = value as VNode;
	while (isCellVNode(vnode)) vnode = getCellVNode(vnode);
	return vnode;
}

function renderBranch(routes: RouteRecord[], context: RouteContextValue): Child {
	let outlet: Child = null;
	for (let index = routes.length - 1; index >= 0; index--) {
		const route = routes[index]!;
		const child = outlet;
		// Route definitions retain authored types; compiled router code receives the
		// same function identities after canonical component normalization.
		outlet = createVNode(
			MatchedRoute,
			{
				context,
				key: route.id,
				render: () =>
					route.component
						? createVNode(
								route.component as ComponentFunction<any, any>,
								route.componentProps ?? {}
							)
						: child
			},
			child
		);
	}
	return outlet;
}

/**
 * Projects the current matched branch for one reactive router version.
 * @exact pure
 */
function routerBranch(
	controller: ExactRouter<RouteRecord>,
	context: RouteContextValue,
	_version: number
): Child {
	const matches = controller.getSnapshot().matches;
	return matches.length
		? renderBranch(
				matches.map((match) => match.route),
				context
			)
		: null;
}

function MatchedRoute(
	this: Component<{}>,
	props: { context: RouteContextValue; render: () => Child; children?: Child | Child[] }
) {
	this.setContext(RouteContext, props.context);
	this.setContext(OutletContext, {
		get current() {
			return props.children;
		}
	});
	return () => props.render();
}

/** Performs the outlet domain operation. */
export function Outlet(this: Component<{}>) {
	const outlet = this.getContext(OutletContext);
	return () => outlet.current as Child;
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
	return () =>
		createVNode(
			'a',
			{ ...rest, href: route.href(to), onClick: click },
			...(Array.isArray(children) ? children : children === undefined ? [] : [children])
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
	const className = this.reactive(() =>
		typeof props.className === 'function' ? props.className(active.get()) : props.className
	);
	const ariaCurrent = this.reactive(() => (active.get() ? ('page' as const) : undefined));
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
	return () =>
		createVNode(
			'a',
			{
				...rest,
				href: route.href(to),
				onClick: click,
				className,
				'aria-current': ariaCurrent
			},
			...(Array.isArray(children) ? children : children === undefined ? [] : [children])
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

for (const [component, identity] of [
	[Router, '@exactjs/router:Router'],
	[Route, '@exactjs/router:Route'],
	[Outlet, '@exactjs/router:Outlet'],
	[Link, '@exactjs/router:Link'],
	[NavLink, '@exactjs/router:NavLink'],
	[Navigate, '@exactjs/router:Navigate'],
	[MatchedRoute, '@exactjs/router:MatchedRoute']
] as const)
	markExactComponent(component, identity);

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
