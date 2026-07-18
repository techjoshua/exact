import {
  createContext,
  createVNode,
  getCellVNode,
  isCellVNode,
  type Child,
  type Component,
  type ComponentFunction,
  type VNode
} from "@exact/core";
import { getRequestContext, RequestContext, type RequestContextValue } from "@exact/request";
import {
  createExactRouter,
  createKey,
  hrefFor,
  matchRoutes,
  normalizeBasename,
  normalizePath,
  resolveTarget,
  routeUrl,
  stripBasename,
  toUrl,
  type ExactRouteDefinition,
  type ExactRouter,
  type HistoryAction,
  type LocationSource,
  type NavigationOptions,
  type RouteLocation,
  type RouteMatch,
  type RouterMode
} from "./core.js";

export {
  createExactRouter,
  generatePath,
  hrefFor,
  locationValue,
  matchPath,
  matchRoutes,
  normalizeBasename,
  normalizePath,
  resolveTarget,
  routeUrl,
  stripBasename,
  toUrl
} from "./core.js";
export type {
  CreateExactRouterOptions,
  ExactRouteDefinition,
  ExactRouter,
  ExactRouterSnapshot,
  HistoryAction,
  LocationSource,
  NavigationBlocker,
  NavigationOptions,
  RouteLocation,
  RouteMatch,
  RouterMode
} from "./core.js";
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

export const RouteContext = createContext<RouteContextValue>("exact.route", true);
const OutletContext = createContext<Child | Child[] | undefined>("exact.route.outlet");

export type RouterProps = {
  mode?: RouterMode;
  basename?: string;
  source?: LocationSource;
  children?: Child | Child[];
};

type RouterState = { version: number };

export function Router(this: Component<RouterState>, props: RouterProps) {
  this.state.version = 0;
  const mode = props.mode ?? "history";
  const basename = normalizeBasename(props.basename);
  const request = componentRequestContext(this) ?? getRequestContext();
  if (request) this.setContext(RequestContext, request);
  const source = props.source ?? requestSource(request) ?? browserSource(mode);
  if (!source) throw new Error("Router requires a location source outside a browser or ambient request context");
  const routes = routeChildren(props.children);
  const controller = createExactRouter({ source, routes, basename, mode });
  const owner = this;
  let routeContext!: RouteContextValue;

  const refresh = () => { this.state.version++; };
  let unsubscribe: (() => void) | undefined;
  this.onMount(() => { unsubscribe = controller.subscribe(refresh); });
  this.onUnmount(() => { unsubscribe?.(); controller.dispose(); });

  routeContext = {
    router: controller,
    get location() { void owner.state.version; return controller.getSnapshot().location; },
    get params() { void owner.state.version; return controller.getSnapshot().params; },
    get matches() { void owner.state.version; return controller.getSnapshot().matches; },
    basename,
    navigate: (to, options) => { void controller.navigate(to, options); },
    href: to => controller.createHref(to),
    searchParams: () => new URLSearchParams(routeContext.location.search)
  };
  this.setContext(RouteContext, routeContext);

  return () => {
    void this.state.version;
    const matches = controller.getSnapshot().matches;
    return matches.length ? renderBranch(matches.map(match => match.route), routeContext) : null;
  };
}

export type RouteProps = {
  path?: string;
  index?: boolean;
  caseSensitive?: boolean;
  component?: ComponentFunction<any, any>;
  componentProps?: Record<string, unknown>;
  children?: Child | Child[];
};

/** Declarative route marker consumed by Router; it does not render independently. */
export function Route(_props: RouteProps): null { return null; }

type RouteRecord = RouteProps & ExactRouteDefinition & { children: RouteRecord[] };

function routeChildren(children: Child | Child[] | undefined, parentId = "root"): RouteRecord[] {
  const values = Array.isArray(children) ? children : children === undefined ? [] : [children];
  const output: RouteRecord[] = [];
  for (const value of values) {
    const vnode = unwrapCell(value);
    if (!vnode || vnode.type !== Route) continue;
    const props = vnode.props as RouteProps;
    const id = `${parentId}.${output.length}`;
    const children = routeChildren(vnode.children.length ? vnode.children : props.children, id);
    output.push({ ...props, id, children });
  }
  return output;
}

function unwrapCell(value: Child): VNode | undefined {
  if (!value || typeof value !== "object") return undefined;
  const vnode = value as VNode;
  return isCellVNode(vnode) ? getCellVNode(vnode) : vnode;
}

function renderBranch(routes: RouteRecord[], context: RouteContextValue): Child {
  let outlet: Child = null;
  for (let index = routes.length - 1; index >= 0; index--) outlet = createVNode(MatchedRoute, { route: routes[index]!, context, outlet });
  return outlet;
}

function MatchedRoute(this: Component<{}>, props: { route: RouteRecord; context: RouteContextValue; outlet: Child }) {
  this.setContext(RouteContext, props.context);
  this.setContext(OutletContext, props.outlet);
  return () => props.route.component ? createVNode(props.route.component, props.route.componentProps ?? {}) : props.outlet;
}

export function Outlet(this: Component<{}>) {
  const outlet = this.getContext(OutletContext);
  return () => outlet as Child;
}

export type LinkProps = Record<string, unknown> & { to: string | URL; replace?: boolean; state?: unknown; children?: Child | Child[]; onClick?: (event: MouseEvent) => unknown };

export function Link(this: Component<{}>, props: LinkProps) {
  const route = this.getContext(RouteContext);
  const click = (event: MouseEvent) => {
    const result = props.onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return result;
    const anchor = (event.target as Element | null)?.closest("a");
    if (!anchor || anchor.tagName.toLowerCase() !== "a") return result;
    if (anchor.target && anchor.target !== "_self" || anchor.hasAttribute("download")) return result;
    const location = anchor.ownerDocument.defaultView?.location;
    if (!location) return result;
    const destination = new URL((anchor as HTMLAnchorElement).href, location.href);
    if (destination.origin !== location.origin) return result;
    event.preventDefault();
    route.navigate(props.to, { replace: props.replace, state: props.state });
    return result;
  };
  return () => {
    const { to, replace: _replace, state: _state, children, onClick: _onClick, ...rest } = props;
    return createVNode("a", { ...rest, href: route.href(to), onClick: click }, ...(Array.isArray(children) ? children : children === undefined ? [] : [children]));
  };
}

export type NavLinkProps = LinkProps & { end?: boolean; className?: string | ((active: boolean) => string) };
export function NavLink(this: Component<{}>, props: NavLinkProps) {
  const route = this.getContext(RouteContext);
  return () => {
    const href = route.href(props.to);
    const publicPath = href.startsWith("#") ? href.slice(1).split(/[?#]/)[0] ?? "/" : new URL(href, "http://exact.local").pathname;
    const target = stripBasename(normalizePath(publicPath), route.basename);
    const current = route.location.pathname;
    const active = props.end ? current === target : current === target || current.startsWith(`${target.replace(/\/$/, "")}/`);
    const className = typeof props.className === "function" ? props.className(active) : props.className;
    return createVNode(Link, { ...props, className, "aria-current": active ? "page" : undefined });
  };
}

export function Navigate(this: Component<{}>, props: { to: string | URL; replace?: boolean; status?: number }) {
  const route = this.getContext(RouteContext);
  route.navigate(props.to, { replace: props.replace ?? true, status: props.status });
  return null;
}

export function createMemoryLocationSource(
  initial: string | URL | readonly (string | URL)[] = "http://exact.local/",
  initialIndex?: number
): LocationSource & { entries: readonly URL[]; index(): number } {
  const initialEntries = Array.isArray(initial) ? initial : [initial];
  if (!initialEntries.length) throw new Error("Memory location source requires at least one entry");
  const entries: URL[] = initialEntries.map(value => toUrl(value));
  let index = initialIndex ?? entries.length - 1;
  if (index < 0 || index >= entries.length) throw new RangeError("Memory location source initialIndex is outside its entries");
  let action: HistoryAction = "POP";
  const states: unknown[] = entries.map(() => undefined);
  const keys = entries.map(() => createKey());
  const listeners = new Set<(action?: HistoryAction) => void>();
  const notify = () => listeners.forEach(listener => listener(action));
  return {
    get entries() { return entries; },
    index: () => index,
    location: () => entries[index]!,
    state: () => states[index],
    key: () => keys[index]!,
    action: () => action,
    push(url, state) {
      action = "PUSH";
      entries.splice(++index, entries.length, url);
      states.splice(index, states.length, state);
      keys.splice(index, keys.length, createKey());
      notify();
    },
    replace(url, state) {
      action = "REPLACE";
      entries[index] = url;
      states[index] = state;
      keys[index] = createKey();
      notify();
    },
    go(delta) {
      const next = Math.min(entries.length - 1, Math.max(0, index + delta));
      if (next === index) return;
      action = "POP";
      index = next;
      notify();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}

function requestSource(request: RequestContextValue | undefined): LocationSource | undefined {
  if (!request) return undefined;
  return {
    location: () => request.url,
    push: (url, _state, status) => request.redirect?.(url, status ?? 302),
    replace: (url, _state, status) => request.redirect?.(url, status ?? 302),
    action: () => "POP",
    key: () => "request"
  };
}

function componentRequestContext(component: Component<any>): RequestContextValue | undefined {
  try {
    return component.getContext(RequestContext);
  } catch {
    return undefined;
  }
}

function browserSource(mode: RouterMode): LocationSource | undefined {
  if (typeof window === "undefined") return undefined;
  const read = () => mode === "hash" ? new URL(window.location.hash.slice(1) || "/", window.location.origin) : new URL(window.location.href);
  return {
    location: read,
    state: () => window.history.state?.usr,
    key: () => String(window.history.state?.key ?? "default"),
    push(url, state) {
      const next = { usr: state, key: createKey() };
      mode === "hash" ? window.history.pushState(next, "", `#${url.pathname}${url.search}${url.hash}`) : window.history.pushState(next, "", url);
    },
    replace(url, state) {
      const next = { usr: state, key: createKey() };
      mode === "hash" ? window.history.replaceState(next, "", `#${url.pathname}${url.search}${url.hash}`) : window.history.replaceState(next, "", url);
    },
    go(delta) { window.history.go(delta); },
    subscribe(listener) {
      const type = mode === "hash" ? "hashchange" : "popstate";
      const handle = () => listener("POP");
      window.addEventListener(type, handle);
      return () => window.removeEventListener(type, handle);
    }
  };
}
