import {
	createContext,
	createVNode,
	Dynamic,
	Fragment,
	getCellVNode,
	isCellVNode,
	markExactComponent,
	observeComponentAsync,
	unwrap,
	type Child,
	type Component,
	type ComponentFunction,
	type ComponentInstance,
	type InteractionHandler,
	type VNode
} from '@exactjs/core';
import { getRequestContext, RequestContext, type RequestContextValue } from '@exactjs/request';
import { RouterControllerContext } from './context.js';
import {
	createBrowserLocationSource,
	createExactRouter,
	normalizeBasename,
	normalizePath,
	stripBasename,
	type ExactRouteDefinition,
	type ExactRouter,
	type LocationSource,
	type NavigationOptions,
	type RouteLocation,
	type RouteMatch,
	type RouterMode
} from './core.js';

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
	const owner = this;

	const refresh = () => {
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

	const routeContext: RouteContextValue = {
		router: controller,
		get location() {
			void owner.state.version;
			return controller.getSnapshot().location;
		},
		get params() {
			void owner.state.version;
			return controller.getSnapshot().params;
		},
		get matches() {
			void owner.state.version;
			return controller.getSnapshot().matches;
		},
		basename,
		navigate: (to, options) => {
			void controller.navigate(to, options);
		},
		href: (to) => controller.createHref(to),
		searchParams: () => new URLSearchParams(routeContext.location.search)
	};
	this.setContext(RouteContext, routeContext);
	this.setContext(RouterControllerContext, controller);

	return () => routerBranch(controller, routeContext, this.state.version);
}

/** Defines the properties accepted by route. */
export type RouteProps = {
	path?: string;
	index?: boolean;
	caseSensitive?: boolean;
	component?: ComponentFunction<any, any>;
	componentProps?: Record<string, unknown>;
	children?: Child | Child[];
};

/** Declarative route marker consumed by Router; it does not render independently. */
export function Route(_props: RouteProps): null {
	return null;
}

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
		if (vnode.type !== Route) return;
		const rawProps = vnode.props as RouteProps;
		const props: RouteProps = {
			...rawProps,
			...(rawProps.path !== undefined ? { path: unwrap(rawProps.path) as string } : {}),
			...(rawProps.index !== undefined ? { index: unwrap(rawProps.index) as boolean } : {}),
			...(rawProps.caseSensitive !== undefined
				? { caseSensitive: unwrap(rawProps.caseSensitive) as boolean }
				: {}),
			...(rawProps.component !== undefined
				? { component: unwrap(rawProps.component) as ComponentFunction<any, any> }
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
		outlet = createVNode(
			MatchedRoute,
			{
				context,
				key: route.id,
				render: () =>
					route.component ? createVNode(route.component, route.componentProps ?? {}) : child
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
	const click = (event: MouseEvent) => {
		let result = props.onClick?.(event);
		if (
			result !== null &&
			(typeof result === 'object' || typeof result === 'function') &&
			typeof (result as PromiseLike<unknown>).then === 'function'
		) {
			// The link may unmount as navigation commits. Observe the consumer callback against
			// the durable Link owner before that unmount cancels the surrounding interaction.
			observeComponentAsync(this as ComponentInstance<{}>, result, 'event', 'click');
			result = Promise.resolve(result).catch(() => undefined);
		}
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return result;
		const anchor = (event.target as Element | null)?.closest('a');
		if (!anchor || anchor.tagName.toLowerCase() !== 'a') return result;
		if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download'))
			return result;
		const location = anchor.ownerDocument.defaultView?.location;
		if (!location) return result;
		const destination = new URL((anchor as HTMLAnchorElement).href, location.href);
		if (destination.origin !== location.origin) return result;
		event.preventDefault();
		route.navigate(props.to, { replace: props.replace, state: props.state });
		return result;
	};
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
	return () => createVNode(Link, { ...props, ...navLinkPresentation(route, props) });
}

/**
 * Derives active-link presentation from the current route snapshot.
 * @exact pure
 */
function navLinkPresentation(
	route: RouteContextValue,
	props: NavLinkProps
): Pick<NavLinkProps, 'className'> & { 'aria-current': 'page' | undefined } {
	const href = route.href(props.to);
	const publicPath = href.startsWith('#')
		? (href.slice(1).split(/[?#]/)[0] ?? '/')
		: new URL(href, 'http://exact.local').pathname;
	const target = stripBasename(normalizePath(publicPath), route.basename);
	const current = route.location.pathname;
	const active = props.end
		? current === target
		: current === target || current.startsWith(`${target.replace(/\/$/, '')}/`);
	const className =
		typeof props.className === 'function' ? props.className(active) : props.className;
	return { className, 'aria-current': active ? 'page' : undefined };
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

function componentRequestContext(component: Component<any>): RequestContextValue | undefined {
	try {
		return component.getContext(RequestContext);
	} catch {
		return undefined;
	}
}
