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
  id?: string;
  path?: string;
  index?: boolean;
  caseSensitive?: boolean;
  children?: readonly ExactRouteDefinition[];
  loader?: ExactRouteLoader;
  action?: ExactRouteAction;
  shouldRevalidate?: ExactShouldRevalidate;
  lazy?: ExactLazyRoute;
  handle?: unknown;
};
export type ExactDataFunctionArgs = Readonly<{
  request: Request;
  params: Readonly<Record<string, string>>;
  context: unknown;
  signal: AbortSignal;
}>;
export type ExactRouteLoader = (args: ExactDataFunctionArgs) => unknown | Promise<unknown>;
export type ExactRouteAction = (args: ExactDataFunctionArgs) => unknown | Promise<unknown>;
export type ExactShouldRevalidate = (args: Readonly<{
  currentUrl: URL;
  nextUrl: URL;
  currentParams: Readonly<Record<string, string>>;
  nextParams: Readonly<Record<string, string>>;
  actionResult?: unknown;
  defaultShouldRevalidate: boolean;
}>) => boolean;
export type ExactLazyRoute = () => Promise<Partial<Pick<
  ExactRouteDefinition,
  "loader" | "action" | "shouldRevalidate" | "handle"
>>>;
export type ExactHydrationData = Readonly<{
  loaderData?: Readonly<Record<string, unknown>>;
  actionData?: Readonly<Record<string, unknown>>;
  errors?: Readonly<Record<string, unknown>>;
}>;
export type FetcherSnapshot = Readonly<{
  state: "idle" | "loading" | "submitting";
  data?: unknown;
  error?: unknown;
}>;
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
    state: "idle" | "loading" | "submitting";
    location?: RouteLocation;
    transitionId: number;
  }>;
  loaderData: Readonly<Record<string, unknown>>;
  actionData: Readonly<Record<string, unknown>>;
  errors: Readonly<Record<string, unknown>>;
  revalidation: "idle" | "loading";
  fetchers: ReadonlyMap<string, FetcherSnapshot>;
}>;

export interface ExactRouter<Route extends ExactRouteDefinition = ExactRouteDefinition> {
  readonly basename: string;
  readonly mode: RouterMode;
  getSnapshot(): ExactRouterSnapshot<Route>;
  subscribe(listener: () => void): () => void;
  setRoutes(routes: readonly Route[]): void;
  createHref(to: string | URL): string;
  navigate(to: string | URL | number, options?: NavigationOptions): Promise<void>;
  initialize(): Promise<void>;
  submit(target: string | URL, init?: RequestInit): Promise<void>;
  fetch(key: string, routeId: string, target: string | URL, init?: RequestInit): Promise<void>;
  revalidate(): Promise<void>;
  block(blocker: NavigationBlocker): () => void;
  dispose(): void;
}

export type CreateExactRouterOptions<Route extends ExactRouteDefinition> = {
  source: LocationSource;
  routes?: readonly Route[];
  basename?: string;
  mode?: RouterMode;
  context?: unknown;
  hydrationData?: ExactHydrationData;
};

export function createExactRouter<Route extends ExactRouteDefinition>(
  options: CreateExactRouterOptions<Route>
): ExactRouter<Route> {
  const source = options.source;
  const basename = normalizeBasename(options.basename);
  const mode = options.mode ?? "history";
  let routes = normalizeRouteIds(options.routes ?? []);
  let transitionId = 0;
  let disposed = false;
  let sourceRevision = 0;
  let activeAbort: AbortController | undefined;
  let loaderData: Record<string, unknown> = { ...(options.hydrationData?.loaderData ?? {}) };
  let actionData: Record<string, unknown> = { ...(options.hydrationData?.actionData ?? {}) };
  let errors: Record<string, unknown> = { ...(options.hydrationData?.errors ?? {}) };
  let revalidation: "idle" | "loading" = "idle";
  const fetchers = new Map<string, FetcherSnapshot>();
  const hasInitialData = options.hydrationData !== undefined || !routes.some(hasDataWork);
  const listeners = new Set<() => void>();
  const blockers = new Set<NavigationBlocker>();
  let initialized = hasInitialData;
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
      initialized,
      navigation: Object.freeze(navigation),
      loaderData: Object.freeze({ ...loaderData }),
      actionData: Object.freeze({ ...actionData }),
      errors: Object.freeze({ ...errors }),
      revalidation,
      fetchers: new Map(fetchers)
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
    const nextMatches = matchRoutes(routes, nextLocation.pathname);
    const result = nextMatches.some(match => hasOwnDataWork(match.route))
      ? await runLoaders(target, nextMatches, activeAbort.signal)
      : { data: {}, errors: {} };
    if (result.redirect) {
      if (currentTransition !== transitionId) return;
      await navigate(result.redirect, { replace: true, status: result.status });
      return;
    }
    if (currentTransition !== transitionId || activeAbort.signal.aborted) return;
    loaderData = result.data;
    errors = result.errors;
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

  async function initialize(): Promise<void> {
    assertActive();
    if (initialized) return;
    activeAbort?.abort();
    activeAbort = new AbortController();
    const result = await runLoaders(source.location(), snapshot.matches, activeAbort.signal);
    if (result.redirect) {
      await navigate(result.redirect, { replace: true, status: result.status });
      initialized = true;
      return;
    }
    loaderData = result.data;
    errors = result.errors;
    initialized = true;
    snapshot = buildSnapshot(snapshot.historyAction);
    notify();
  }

  async function submit(target: string | URL, init: RequestInit = {}): Promise<void> {
    assertActive();
    const url = resolveTarget(target, source.location(), basename, mode);
    const matches = matchRoutes(routes, stripBasename(normalizePath(url.pathname), basename));
    const actionMatch = [...matches].reverse().find(match => match.route.action || match.route.lazy);
    if (!actionMatch) throw new Error(`No route action matches ${url.pathname}`);
    activeAbort?.abort();
    activeAbort = new AbortController();
    const currentTransition = ++transitionId;
    snapshot = Object.freeze({
      ...snapshot,
      navigation: Object.freeze({ state: "submitting", location: locationForUrl(url, init), transitionId: currentTransition })
    });
    notify();
    try {
      await materializeLazy(actionMatch.route);
      const result = await actionMatch.route.action!({
        request: new Request(url, init),
        params: actionMatch.params,
        context: options.context,
        signal: activeAbort.signal
      });
      const redirect = redirectResult(result);
      if (redirect) {
        await navigate(redirect.location, { replace: true, status: redirect.status });
        return;
      }
      actionData = { [actionMatch.id]: result };
      await revalidate(result);
    } catch (error) {
      errors = { ...errors, [actionMatch.id]: error };
      snapshot = buildSnapshot(snapshot.historyAction);
      notify();
    }
  }

  async function revalidate(actionResult?: unknown): Promise<void> {
    assertActive();
    revalidation = "loading";
    snapshot = buildSnapshot(snapshot.historyAction);
    notify();
    activeAbort?.abort();
    activeAbort = new AbortController();
    const currentUrl = source.location();
    const selected = snapshot.matches.filter(match => match.route.shouldRevalidate?.({
      currentUrl,
      nextUrl: currentUrl,
      currentParams: match.params,
      nextParams: match.params,
      actionResult,
      defaultShouldRevalidate: true
    }) ?? true);
    const result = await runLoaders(currentUrl, selected, activeAbort.signal, loaderData);
    loaderData = result.data;
    errors = result.errors;
    revalidation = "idle";
    snapshot = buildSnapshot(snapshot.historyAction);
    notify();
  }

  async function fetch(key: string, routeId: string, target: string | URL, init: RequestInit = {}): Promise<void> {
    assertActive();
    const url = resolveTarget(target, source.location(), basename, mode);
    const matches = matchRoutes(routes, stripBasename(normalizePath(url.pathname), basename));
    const match = matches.find(candidate => candidate.id === routeId);
    if (!match) throw new Error(`Fetcher route ${routeId} does not match ${url.pathname}`);
    const mutation = !!init.method && !/^(?:GET|HEAD)$/i.test(init.method);
    fetchers.set(key, Object.freeze({ state: mutation ? "submitting" : "loading" }));
    snapshot = buildSnapshot(snapshot.historyAction);
    notify();
    const abort = new AbortController();
    try {
      await materializeLazy(match.route);
      const handler = mutation ? match.route.action : match.route.loader;
      if (!handler) throw new Error(`Route ${routeId} does not define a ${mutation ? "action" : "loader"}`);
      const data = await handler({
        request: new Request(url, init),
        params: match.params,
        context: options.context,
        signal: abort.signal
      });
      fetchers.set(key, Object.freeze({ state: "idle", data }));
      if (mutation) await revalidate(data);
    } catch (error) {
      fetchers.set(key, Object.freeze({ state: "idle", error }));
    }
    snapshot = buildSnapshot(snapshot.historyAction);
    notify();
  }

  async function runLoaders(
    url: URL,
    matches: readonly RouteMatch<Route>[],
    signal: AbortSignal,
    initial: Readonly<Record<string, unknown>> = {}
  ): Promise<{ data: Record<string, unknown>; errors: Record<string, unknown>; redirect?: string; status?: number }> {
    const data = { ...initial };
    const nextErrors: Record<string, unknown> = {};
    let redirect: { location: string; status: number } | undefined;
    await Promise.all(matches.map(async match => {
      try {
        await materializeLazy(match.route);
        if (!match.route.loader) return;
        const value = await match.route.loader({
          request: new Request(url),
          params: match.params,
          context: options.context,
          signal
        });
        const nextRedirect = redirectResult(value);
        if (nextRedirect) redirect = nextRedirect;
        else data[match.id] = value;
      } catch (error) {
        const nextRedirect = redirectResult(error);
        if (nextRedirect) redirect = nextRedirect;
        else nextErrors[match.id] = error;
      }
    }));
    return { data, errors: nextErrors, ...(redirect ? { redirect: redirect.location, status: redirect.status } : {}) };
  }

  async function materializeLazy(route: Route): Promise<void> {
    if (!route.lazy) return;
    const values = await route.lazy();
    Object.assign(route, values, { lazy: undefined });
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
      routes = normalizeRouteIds(nextRoutes);
      refresh(snapshot.historyAction);
    },
    createHref: (to: string | URL) => hrefFor(to, source.location(), basename, mode),
    navigate,
    initialize,
    submit,
    fetch,
    revalidate: () => revalidate(),
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

function hasDataWork(route: ExactRouteDefinition): boolean {
  return !!(route.loader || route.lazy || route.children?.some(hasDataWork));
}

function normalizeRouteIds<Route extends ExactRouteDefinition>(
  values: readonly Route[],
  parent = "route"
): readonly Route[] {
  values.forEach((route, index) => {
    const id = route.id ?? `${parent}-${index}`;
    if (!route.id) Object.assign(route, { id });
    if (route.children) normalizeRouteIds(route.children as readonly Route[], id);
  });
  return values;
}

function hasOwnDataWork(route: ExactRouteDefinition): boolean {
  return !!(route.loader || route.lazy);
}

function redirectResult(value: unknown): { location: string; status: number } | undefined {
  if (!(value instanceof Response) || value.status < 300 || value.status >= 400) return undefined;
  const location = value.headers.get("Location");
  return location ? { location, status: value.status } : undefined;
}

function locationForUrl(url: URL, init: RequestInit): RouteLocation {
  return Object.freeze({
    pathname: normalizePath(url.pathname),
    search: url.search,
    hash: url.hash,
    state: undefined,
    key: `${String(init.method ?? "GET").toLowerCase()}-${createKey()}`
  });
}

export function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: location } });
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
    id: route.id ?? "__match_path__",
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
      id: route.id ?? `route-${matches.length}`,
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
