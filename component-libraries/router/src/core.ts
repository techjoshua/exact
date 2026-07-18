export type RouterMode = "history" | "hash";
export type HistoryAction = "POP" | "PUSH" | "REPLACE";
export type RouteLocation = {
  pathname: string;
  search: string;
  hash: string;
  state?: unknown;
  key: string;
};
export type NavigationOptions = {
  replace?: boolean;
  state?: unknown;
  status?: number;
};
export type RouteMatch<Route = ExactRouteDefinition> = {
  id: string;
  route: Route;
  path?: string;
  pathname: string;
  pathnameBase: string;
  params: Readonly<Record<string, string>>;
};
export type ExactRouteDefinition = {
  id: string;
  path?: string;
  index?: boolean;
  caseSensitive?: boolean;
  children?: readonly ExactRouteDefinition[];
};
export type NavigationBlocker = (transition: Readonly<{
  currentLocation: RouteLocation;
  nextLocation: RouteLocation;
  historyAction: HistoryAction;
}>) => boolean | string;

export interface LocationSource {
  location(): URL;
  push(url: URL, state?: unknown, status?: number): void;
  replace(url: URL, state?: unknown, status?: number): void;
  go?(delta: number): void;
  subscribe?(listener: (action?: HistoryAction) => void): () => void;
  state?(): unknown;
  key?(): string;
  action?(): HistoryAction;
}

export type ExactRouterSnapshot<Route extends ExactRouteDefinition = ExactRouteDefinition> = Readonly<{
  location: RouteLocation;
  historyAction: HistoryAction;
  matches: readonly RouteMatch<Route>[];
  params: Readonly<Record<string, string>>;
  initialized: boolean;
  navigation: Readonly<{
    state: "idle" | "loading";
    location?: RouteLocation;
    transitionId: number;
  }>;
}>;

export interface ExactRouter<Route extends ExactRouteDefinition = ExactRouteDefinition> {
  readonly basename: string;
  readonly mode: RouterMode;
  getSnapshot(): ExactRouterSnapshot<Route>;
  subscribe(listener: () => void): () => void;
  setRoutes(routes: readonly Route[]): void;
  createHref(to: string | URL): string;
  navigate(to: string | URL | number, options?: NavigationOptions): Promise<void>;
  block(blocker: NavigationBlocker): () => void;
  dispose(): void;
}

export type CreateExactRouterOptions<Route extends ExactRouteDefinition> = {
  source: LocationSource;
  routes?: readonly Route[];
  basename?: string;
  mode?: RouterMode;
};

export function createExactRouter<Route extends ExactRouteDefinition>(
  options: CreateExactRouterOptions<Route>
): ExactRouter<Route> {
  const source = options.source;
  const basename = normalizeBasename(options.basename);
  const mode = options.mode ?? "history";
  let routes = options.routes ?? [];
  let transitionId = 0;
  let disposed = false;
  let sourceRevision = 0;
  let activeAbort: AbortController | undefined;
  const listeners = new Set<() => void>();
  const blockers = new Set<NavigationBlocker>();
  let snapshot = buildSnapshot("POP");

  const notify = () => listeners.forEach(listener => listener());
  const refresh = (action = source.action?.() ?? "POP") => {
    if (disposed) return;
    sourceRevision++;
    snapshot = buildSnapshot(action);
    notify();
  };
  const unsubscribe = source.subscribe?.(refresh);

  function buildSnapshot(action: HistoryAction, navigation: ExactRouterSnapshot<Route>["navigation"] = {
    state: "idle",
    transitionId
  }): ExactRouterSnapshot<Route> {
    const location = locationValue(source, mode, basename);
    const matches = matchRoutes(routes, location.pathname);
    return Object.freeze({
      location,
      historyAction: action,
      matches,
      params: Object.freeze({ ...(matches.at(-1)?.params ?? {}) }),
      initialized: true,
      navigation: Object.freeze(navigation)
    });
  }

  async function navigate(to: string | URL | number, options: NavigationOptions = {}): Promise<void> {
    assertActive();
    if (typeof to === "number") {
      if (!source.go) throw new Error("This router location source does not support delta navigation");
      source.go(to);
      return;
    }
    const target = resolveTarget(to, source.location(), basename, mode);
    const action: HistoryAction = options.replace ? "REPLACE" : "PUSH";
    const nextLocation = locationValue({
      location: () => target,
      push() {},
      replace() {},
      state: () => options.state,
      key: () => createKey()
    }, mode, basename);
    const transition = Object.freeze({
      currentLocation: snapshot.location,
      nextLocation,
      historyAction: action
    });
    for (const blocker of blockers) if (blocker(transition)) return;

    activeAbort?.abort();
    activeAbort = new AbortController();
    const currentTransition = ++transitionId;
    snapshot = Object.freeze({
      ...snapshot,
      navigation: Object.freeze({ state: "loading", location: nextLocation, transitionId: currentTransition })
    });
    notify();
    const revision = sourceRevision;
    if (options.replace) source.replace(target, options.state, options.status);
    else source.push(target, options.state, options.status);
    if (currentTransition !== transitionId || activeAbort.signal.aborted) return;
    // Sources with subscriptions refresh themselves. Request-backed sources do
    // not navigate locally, so retain their location and only settle state.
    if (sourceRevision === revision) {
      snapshot = source.subscribe
        ? buildSnapshot(action)
        : Object.freeze({ ...snapshot, navigation: Object.freeze({ state: "idle", transitionId: currentTransition }) });
      notify();
    }
  }

  function assertActive(): void {
    if (disposed) throw new Error("Cannot use a disposed router");
  }

  return Object.freeze({
    basename,
    mode,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      assertActive();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setRoutes(nextRoutes: readonly Route[]) {
      assertActive();
      routes = nextRoutes;
      refresh(snapshot.historyAction);
    },
    createHref: (to: string | URL) => hrefFor(to, source.location(), basename, mode),
    navigate,
    block(blocker: NavigationBlocker) {
      assertActive();
      blockers.add(blocker);
      return () => blockers.delete(blocker);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      activeAbort?.abort();
      unsubscribe?.();
      listeners.clear();
      blockers.clear();
    }
  });
}

export function matchRoutes<Route extends ExactRouteDefinition>(
  routes: readonly Route[],
  pathname: string
): readonly RouteMatch<Route>[] {
  const candidates: Array<{ routes: Route[]; score: number }> = [];
  collectBranches(routes, [], candidates);
  const matches = candidates
    .map(candidate => ({ ...candidate, matched: matchBranch(candidate.routes, pathname) }))
    .filter((candidate): candidate is typeof candidate & { matched: readonly RouteMatch<Route>[] } => !!candidate.matched)
    .sort((left, right) => scoreBranch(right.routes) - scoreBranch(left.routes))[0];
  return Object.freeze(matches?.matched ?? []);
}

export function matchPath(
  pattern: string | Readonly<{ path: string; caseSensitive?: boolean; end?: boolean }>,
  pathname: string
): RouteMatch | null {
  const config = typeof pattern === "string" ? { path: pattern, end: true } : pattern;
  const route: ExactRouteDefinition = { id: "__match_path__", path: config.path, caseSensitive: config.caseSensitive };
  const matched = matchRoute(route, segments(pathname), 0, {}, config.end ?? true);
  if (!matched) return null;
  return {
    id: route.id,
    route,
    path: route.path,
    pathname: matched.pathname,
    pathnameBase: matched.pathnameBase,
    params: matched.params
  };
}

export function generatePath(path: string, params: Readonly<Record<string, string | null | undefined>> = {}): string {
  return path.replace(/:([A-Za-z0-9_]+)(\?)?|\*/g, (token, name: string | undefined, optional: string | undefined) => {
    const key = name ?? "*";
    const value = params[key];
    if (value == null) {
      if (optional) return "";
      throw new Error(`Missing route parameter ${key}`);
    }
    return String(value).split("/").map(encodeURIComponent).join(name ? "%2F" : "/");
  }).replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}

function collectBranches<Route extends ExactRouteDefinition>(
  routes: readonly Route[],
  parents: readonly Route[],
  output: Array<{ routes: Route[]; score: number }>
): void {
  for (const route of routes) {
    const branch = [...parents, route];
    const children = route.children ?? [];
    if (!children.length || route.index || route.path === "*") output.push({ routes: branch, score: scoreBranch(branch) });
    if (children.length) collectBranches(children as readonly Route[], branch, output);
  }
}

function scoreBranch(routes: readonly ExactRouteDefinition[]): number {
  return routes.reduce((score, route) => score + (route.index ? 5 : 0) + segments(route.path ?? "").reduce(
    (value, segment) => value + (segment === "*" ? 1 : segment.startsWith(":") ? segment.endsWith("?") ? 15 : 20 : 30),
    0
  ) + 1, 0);
}

function matchBranch<Route extends ExactRouteDefinition>(
  routes: readonly Route[],
  pathname: string
): readonly RouteMatch<Route>[] | undefined {
  const pathSegments = segments(pathname);
  let cursor = 0;
  let params: Record<string, string> = {};
  const matches: RouteMatch<Route>[] = [];
  for (const route of routes) {
    const matched = matchRoute(route, pathSegments, cursor, params, route === routes.at(-1));
    if (!matched) return undefined;
    cursor = matched.cursor;
    params = matched.params;
    matches.push({
      id: route.id,
      route,
      path: route.path,
      pathname: matched.pathname,
      pathnameBase: matched.pathnameBase,
      params: Object.freeze({ ...params })
    });
  }
  if (cursor !== pathSegments.length) return undefined;
  return Object.freeze(matches);
}

function matchRoute(
  route: ExactRouteDefinition,
  pathSegments: readonly string[],
  start: number,
  inherited: Readonly<Record<string, string>>,
  end: boolean
): { cursor: number; params: Record<string, string>; pathname: string; pathnameBase: string } | undefined {
  let cursor = start;
  const params = { ...inherited };
  if (route.index && cursor !== pathSegments.length) return undefined;
  for (const segment of route.index ? [] : segments(route.path ?? "")) {
    if (segment === "*") {
      params["*"] = decode(pathSegments.slice(cursor).join("/"));
      cursor = pathSegments.length;
      break;
    }
    const actual = pathSegments[cursor];
    if (segment.startsWith(":")) {
      const optional = segment.endsWith("?");
      const name = segment.slice(1, optional ? -1 : undefined);
      if (actual === undefined) {
        if (optional) continue;
        return undefined;
      }
      params[name] = decode(actual);
      cursor++;
      continue;
    }
    if (actual === undefined) return undefined;
    const equal = route.caseSensitive ? actual === segment : actual.toLowerCase() === segment.toLowerCase();
    if (!equal) return undefined;
    cursor++;
  }
  if (end && cursor !== pathSegments.length) return undefined;
  const pathname = `/${pathSegments.slice(0, cursor).join("/")}` || "/";
  const splat = route.path?.includes("*");
  const pathnameBase = splat ? `/${pathSegments.slice(0, Math.max(start, cursor - segments(params["*"] ?? "").length)).join("/")}` : pathname;
  return { cursor, params, pathname, pathnameBase: pathnameBase || "/" };
}

export function locationValue(source: LocationSource, mode: RouterMode, basename: string): RouteLocation {
  const url = routeUrl(source.location(), mode);
  const pathname = stripBasename(normalizePath(url.pathname), basename);
  return Object.freeze({
    pathname,
    search: url.search,
    hash: url.hash,
    state: source.state?.(),
    key: source.key?.() ?? "default"
  });
}

export function hrefFor(to: string | URL, current: URL, basename: string, mode: RouterMode): string {
  if (to instanceof URL || typeof to === "string" && /^[a-z][a-z\d+.-]*:/i.test(to)) return String(to);
  const url = resolveTarget(to, current, basename, mode);
  const path = `${url.pathname}${url.search}${url.hash}`;
  return mode === "hash" ? `#${path}` : path;
}

export function resolveTarget(to: string | URL, current: URL, basename: string, mode: RouterMode): URL {
  if (to instanceof URL) return to;
  if (/^[a-z][a-z\d+.-]*:/i.test(to)) return new URL(to);
  const routeCurrent = routeUrl(current, mode);
  if (to.startsWith("/")) return new URL(`${basename}${to}` || "/", routeCurrent.origin);
  return new URL(to, routeCurrent);
}

export function routeUrl(url: URL, mode: RouterMode): URL {
  return mode === "hash" && url.hash.startsWith("#/") ? new URL(url.hash.slice(1), url.origin) : url;
}
export function toUrl(value: string | URL): URL { return value instanceof URL ? value : new URL(value, "http://exact.local"); }
export function normalizeBasename(value?: string): string {
  const normalized = normalizePath(value ?? "/");
  return normalized === "/" ? "" : normalized.replace(/\/$/, "");
}
export function normalizePath(value: string): string {
  const normalized = `/${value}`.replace(/\/{2,}/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
}
export function stripBasename(pathname: string, basename: string): string {
  if (!basename) return pathname;
  const path = pathname.toLowerCase();
  const base = basename.toLowerCase();
  return path === base || path.startsWith(`${base}/`) ? normalizePath(pathname.slice(basename.length)) : pathname;
}
function segments(path: string): string[] { return normalizePath(path).split("/").filter(Boolean); }
function decode(value: string): string { try { return decodeURIComponent(value); } catch { return value; } }
let keySequence = 0;
export function createKey(): string { return (++keySequence).toString(36); }
