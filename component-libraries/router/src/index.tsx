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

export type RouterMode = "history" | "hash";
export type NavigationOptions = { replace?: boolean; state?: unknown; status?: number };
export type RouteLocation = { pathname: string; search: string; hash: string; state?: unknown };
export type RouteMatch = { path?: string; pathname: string; params: Readonly<Record<string, string>> };
export type RouteContextValue = {
  location: RouteLocation;
  params: Readonly<Record<string, string>>;
  matches: readonly RouteMatch[];
  basename: string;
  navigate(to: string | URL, options?: NavigationOptions): void;
  href(to: string | URL): string;
  searchParams(): URLSearchParams;
};

export interface LocationSource {
  location(): URL;
  push(url: URL, state?: unknown, status?: number): void;
  replace(url: URL, state?: unknown, status?: number): void;
  subscribe?(listener: () => void): () => void;
  state?(): unknown;
}

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
  const owner = this;
  let branch: Branch | undefined;
  let routeContext!: RouteContextValue;

  const refresh = () => { this.state.version++; };
  let unsubscribe: (() => void) | undefined;
  this.onMount(() => { unsubscribe = source.subscribe?.(refresh); });
  this.onUnmount(() => unsubscribe?.());

  const navigate = (to: string | URL, options: NavigationOptions = {}) => {
    const target = resolveTarget(to, source.location(), basename, mode);
    if (options.replace) source.replace(target, options.state, options.status);
    else source.push(target, options.state, options.status);
    // Server redirects record response controls; the current server render
    // cannot navigate to the target and must not invalidate itself forever.
    if (!request) refresh();
  };

  routeContext = {
    get location() { void owner.state.version; return locationValue(source, mode, basename); },
    get params() { void owner.state.version; return branch?.params ?? {}; },
    get matches() { void owner.state.version; return branch?.matches ?? []; },
    basename,
    navigate,
    href: to => hrefFor(to, source.location(), basename, mode),
    searchParams: () => new URLSearchParams(routeContext.location.search)
  };
  this.setContext(RouteContext, routeContext);

  return () => {
    void this.state.version;
    branch = matchRoutes(routes, routeContext.location.pathname);
    return branch ? renderBranch(branch.routes, routeContext) : null;
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

type RouteRecord = RouteProps & { children: RouteRecord[] };
type Branch = { routes: RouteRecord[]; params: Record<string, string>; matches: RouteMatch[]; score: number };

function routeChildren(children: Child | Child[] | undefined): RouteRecord[] {
  const values = Array.isArray(children) ? children : children === undefined ? [] : [children];
  const output: RouteRecord[] = [];
  for (const value of values) {
    const vnode = unwrapCell(value);
    if (!vnode || vnode.type !== Route) continue;
    const props = vnode.props as RouteProps;
    output.push({ ...props, children: routeChildren(vnode.children.length ? vnode.children : props.children) });
  }
  return output;
}

function unwrapCell(value: Child): VNode | undefined {
  if (!value || typeof value !== "object") return undefined;
  const vnode = value as VNode;
  return isCellVNode(vnode) ? getCellVNode(vnode) : vnode;
}

function matchRoutes(routes: RouteRecord[], pathname: string): Branch | undefined {
  const candidates: Branch[] = [];
  collectBranches(routes, [], [], candidates);
  for (const candidate of candidates) {
    const matched = matchBranch(candidate.routes, pathname);
    if (matched) candidates[candidates.indexOf(candidate)] = { ...candidate, ...matched };
    else candidate.score = -Infinity;
  }
  return candidates.filter(candidate => candidate.score > -Infinity).sort((a, b) => b.score - a.score)[0];
}

function collectBranches(routes: RouteRecord[], parents: RouteRecord[], _paths: string[], output: Branch[]): void {
  for (const route of routes) {
    const branch = [...parents, route];
    if (!route.children.length || route.index || route.path === "*") output.push({ routes: branch, params: {}, matches: [], score: 0 });
    if (route.children.length) collectBranches(route.children, branch, [], output);
  }
}

function matchBranch(routes: RouteRecord[], pathname: string): Pick<Branch, "params" | "matches" | "score"> | undefined {
  const pathSegments = segments(pathname);
  let cursor = 0;
  let score = 0;
  const params: Record<string, string> = {};
  const matches: RouteMatch[] = [];
  for (const route of routes) {
    const routeSegments = route.index ? [] : segments(route.path ?? "");
    const start = cursor;
    for (const segment of routeSegments) {
      if (segment === "*") {
        params["*"] = decode(pathSegments.slice(cursor).join("/"));
        cursor = pathSegments.length;
        score += 1;
        break;
      }
      const actual = pathSegments[cursor];
      if (actual === undefined) return undefined;
      if (segment.startsWith(":")) {
        params[segment.slice(1)] = decode(actual);
        score += 20;
      } else {
        const equal = route.caseSensitive ? actual === segment : actual.toLowerCase() === segment.toLowerCase();
        if (!equal) return undefined;
        score += 30;
      }
      cursor++;
    }
    if (route.index) score += 5;
    matches.push({ path: route.path, pathname: `/${pathSegments.slice(0, Math.max(cursor, start)).join("/")}`, params: { ...params } });
  }
  if (cursor !== pathSegments.length) return undefined;
  return { params, matches, score: score + routes.length };
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

export function createMemoryLocationSource(initial: string | URL = "http://exact.local/"): LocationSource & { entries: readonly URL[] } {
  const entries: URL[] = [toUrl(initial)];
  let index = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  return {
    get entries() { return entries; },
    location: () => entries[index]!,
    push(url) { entries.splice(++index, entries.length, url); notify(); },
    replace(url) { entries[index] = url; notify(); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}

function requestSource(request: RequestContextValue | undefined): LocationSource | undefined {
  if (!request) return undefined;
  return {
    location: () => request.url,
    push: (url, _state, status) => request.redirect?.(url, status ?? 302),
    replace: (url, _state, status) => request.redirect?.(url, status ?? 302)
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
    state: () => window.history.state,
    push(url, state) { mode === "hash" ? window.history.pushState(state, "", `#${url.pathname}${url.search}${url.hash}`) : window.history.pushState(state, "", url); },
    replace(url, state) { mode === "hash" ? window.history.replaceState(state, "", `#${url.pathname}${url.search}${url.hash}`) : window.history.replaceState(state, "", url); },
    subscribe(listener) { const type = mode === "hash" ? "hashchange" : "popstate"; window.addEventListener(type, listener); return () => window.removeEventListener(type, listener); }
  };
}

function locationValue(source: LocationSource, mode: RouterMode, basename: string): RouteLocation {
  const url = routeUrl(source.location(), mode);
  const pathname = stripBasename(normalizePath(url.pathname), basename);
  return { pathname, search: url.search, hash: url.hash, state: source.state?.() };
}
function hrefFor(to: string | URL, current: URL, basename: string, mode: RouterMode): string {
  if (to instanceof URL || typeof to === "string" && /^[a-z][a-z\d+.-]*:/i.test(to)) return String(to);
  const url = resolveTarget(to, current, basename, mode);
  const path = `${url.pathname}${url.search}${url.hash}`;
  return mode === "hash" ? `#${path}` : path;
}
function resolveTarget(to: string | URL, current: URL, basename: string, mode: RouterMode): URL {
  if (to instanceof URL) return to;
  const external = /^[a-z][a-z\d+.-]*:/i.test(to);
  if (external) return new URL(to);
  const routeCurrent = routeUrl(current, mode);
  if (to.startsWith("/")) return new URL(`${basename}${to}` || "/", routeCurrent.origin);
  return new URL(to, routeCurrent);
}
function routeUrl(url: URL, mode: RouterMode): URL {
  return mode === "hash" && url.hash.startsWith("#/") ? new URL(url.hash.slice(1), url.origin) : url;
}
function toUrl(value: string | URL): URL { return value instanceof URL ? value : new URL(value, "http://exact.local"); }
function normalizeBasename(value?: string): string { const normalized = normalizePath(value ?? "/"); return normalized === "/" ? "" : normalized.replace(/\/$/, ""); }
function normalizePath(value: string): string { const normalized = `/${value}`.replace(/\/{2,}/g, "/"); return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized; }
function stripBasename(pathname: string, basename: string): string {
  if (!basename) return pathname;
  const path = pathname.toLowerCase();
  const base = basename.toLowerCase();
  return path === base || path.startsWith(`${base}/`) ? normalizePath(pathname.slice(basename.length)) : pathname;
}
function segments(path: string): string[] { return normalizePath(path).split("/").filter(Boolean); }
function decode(value: string): string { try { return decodeURIComponent(value); } catch { return value; } }
