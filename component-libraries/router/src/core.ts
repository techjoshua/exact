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
  statusCode: number;
  loaderHeaders: Readonly<Record<string, Headers>>;
  actionHeaders: Readonly<Record<string, Headers>>;
  revalidation: "idle" | "loading";
  fetchers: ReadonlyMap<string, FetcherSnapshot>;
}>;

export interface ExactRouter<Route extends ExactRouteDefinition = ExactRouteDefinition> {
  readonly basename: string;
  readonly mode: RouterMode;
  getSnapshot(): ExactRouterSnapshot<Route>;
  subscribe(listener: () => void): () => void;
  sync(action?: HistoryAction, publish?: boolean): void;
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
  let revalidationAbort: AbortController | undefined;
  let revalidationId = 0;
  let loaderData: Record<string, unknown> = { ...(options.hydrationData?.loaderData ?? {}) };
  let actionData: Record<string, unknown> = { ...(options.hydrationData?.actionData ?? {}) };
  let errors: Record<string, unknown> = { ...(options.hydrationData?.errors ?? {}) };
  let statusCode = 200;
  let loaderHeaders: Record<string, Headers> = {};
  let actionHeaders: Record<string, Headers> = {};
  let revalidation: "idle" | "loading" = "idle";
  const fetchers = new Map<string, FetcherSnapshot>();
  const fetcherAborts = new Map<string, AbortController>();
  const lazyPromises = new WeakMap<object, Promise<void>>();
  const hasInitialData = options.hydrationData !== undefined || !routes.some(hasDataWork);
  const listeners = new Set<() => void>();
  const blockers = new Set<NavigationBlocker>();
  let initialized = hasInitialData;
  let snapshot = buildSnapshot(source.action?.() ?? "POP");

  const notify = () => listeners.forEach(listener => listener());
  const refresh = (action = source.action?.() ?? "POP", publish = true) => {
    if (disposed) return;
    sourceRevision++;
    snapshot = buildSnapshot(action);
    if (publish) notify();
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
      statusCode,
      loaderHeaders: Object.freeze({ ...loaderHeaders }),
      actionHeaders: Object.freeze({ ...actionHeaders }),
      revalidation,
      fetchers: new Map(fetchers)
    });
  }

  async function navigate(to: string | URL | number, options: NavigationOptions = {}, redirectDepth = 0): Promise<void> {
    assertActive();
    if (redirectDepth > 20) throw new Error("Router exceeded the maximum redirect depth of 20");
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

    const operation = beginAuthoritativeOperation();
    const currentTransition = operation.id;
    snapshot = Object.freeze({
      ...snapshot,
      navigation: Object.freeze({ state: "loading", location: nextLocation, transitionId: currentTransition })
    });
    notify();
    const revision = sourceRevision;
    const nextMatches = matchRoutes(routes, nextLocation.pathname);
    const result = nextMatches.some(match => hasOwnDataWork(match.route))
      ? await runLoaders(target, nextMatches, operation.abort.signal)
      : { data: {}, errors: {}, headers: {}, statusCode: 200 };
    if (result.redirect) {
      if (currentTransition !== transitionId) return;
      await navigate(result.redirect, { replace: true, status: result.status }, redirectDepth + 1);
      return;
    }
    if (!ownsAuthoritativeOperation(operation)) return;
    initialized = true;
    loaderData = result.data;
    errors = result.errors;
    loaderHeaders = result.headers;
    statusCode = result.statusCode;
    if (options.replace) source.replace(target, options.state, options.status);
    else source.push(target, options.state, options.status);
    if (!ownsAuthoritativeOperation(operation)) return;
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
    const operation = beginAuthoritativeOperation();
    const result = await runLoaders(source.location(), snapshot.matches, operation.abort.signal);
    if (!ownsAuthoritativeOperation(operation)) return;
    if (result.redirect) {
      await navigate(result.redirect, { replace: true, status: result.status });
      initialized = true;
      snapshot = buildSnapshot(snapshot.historyAction);
      notify();
      return;
    }
    loaderData = result.data;
    errors = result.errors;
    loaderHeaders = result.headers;
    statusCode = result.statusCode;
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
    const operation = beginAuthoritativeOperation();
    const currentTransition = operation.id;
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
        signal: operation.abort.signal
      });
      if (!ownsAuthoritativeOperation(operation)) return;
      const redirect = redirectResult(result);
      if (redirect) {
        await navigate(redirect.location, { replace: true, status: redirect.status });
        return;
      }
      if (result instanceof Response) {
        actionHeaders = { [actionMatch.id]: new Headers(result.headers) };
        statusCode = result.status;
      }
      const data = await unwrapDataResult(result);
      if (!ownsAuthoritativeOperation(operation)) return;
      actionData = { [actionMatch.id]: data };
      await revalidate(data, operation);
    } catch (error) {
      if (!ownsAuthoritativeOperation(operation)) return;
      const redirect = redirectResult(error);
      if (redirect) {
        await navigate(redirect.location, { replace: true, status: redirect.status });
        return;
      }
      if (error instanceof Response) {
        actionHeaders = { [actionMatch.id]: new Headers(error.headers) };
        statusCode = error.status;
      } else {
        statusCode = 500;
      }
      errors = { ...errors, [actionMatch.id]: error };
      snapshot = buildSnapshot(snapshot.historyAction);
      notify();
    }
  }

  async function revalidate(
    actionResult?: unknown,
    owner?: Readonly<{ id: number; abort: AbortController }>
  ): Promise<void> {
    assertActive();
    const operation = owner ?? beginIndependentRevalidation();
    const independentId = owner ? undefined : revalidationId;
    const startingTransition = transitionId;
    const startingRevision = sourceRevision;
    revalidation = "loading";
    snapshot = buildSnapshot(snapshot.historyAction);
    notify();
    const currentUrl = source.location();
    const selected = snapshot.matches.filter(match => match.route.shouldRevalidate?.({
      currentUrl,
      nextUrl: currentUrl,
      currentParams: match.params,
      nextParams: match.params,
      actionResult,
      defaultShouldRevalidate: true
    }) ?? true);
    const result = await runLoaders(currentUrl, selected, operation.abort.signal, loaderData);
    const current = owner
      ? ownsAuthoritativeOperation(owner)
      : independentId === revalidationId
        && transitionId === startingTransition
        && sourceRevision === startingRevision
        && !operation.abort.signal.aborted;
    if (!current) return;
    if (result.redirect) {
      revalidation = "idle";
      await navigate(result.redirect, { replace: true, status: result.status });
      return;
    }
    loaderData = result.data;
    errors = result.errors;
    loaderHeaders = result.headers;
    statusCode = result.statusCode !== 200 || !owner ? result.statusCode : statusCode;
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
    fetcherAborts.get(key)?.abort();
    const abort = new AbortController();
    fetcherAborts.set(key, abort);
    try {
      await materializeLazy(match.route);
      const handler = mutation ? match.route.action : match.route.loader;
      if (!handler) throw new Error(`Route ${routeId} does not define a ${mutation ? "action" : "loader"}`);
      const result = await handler({
        request: new Request(url, init),
        params: match.params,
        context: options.context,
        signal: abort.signal
      });
      if (fetcherAborts.get(key) !== abort || abort.signal.aborted) return;
      const redirect = redirectResult(result);
      if (redirect) {
        fetchers.set(key, Object.freeze({ state: "idle" }));
        await navigate(redirect.location, { replace: true, status: redirect.status });
        return;
      }
      const data = await unwrapDataResult(result);
      fetchers.set(key, Object.freeze({ state: "idle", data }));
      if (mutation) await revalidate(data);
    } catch (error) {
      if (fetcherAborts.get(key) !== abort || abort.signal.aborted) return;
      const redirect = redirectResult(error);
      if (redirect) {
        fetchers.set(key, Object.freeze({ state: "idle" }));
        await navigate(redirect.location, { replace: true, status: redirect.status });
        return;
      }
      fetchers.set(key, Object.freeze({ state: "idle", error }));
    }
    snapshot = buildSnapshot(snapshot.historyAction);
    notify();
    if (fetcherAborts.get(key) === abort) fetcherAborts.delete(key);
  }

  async function runLoaders(
    url: URL,
    matches: readonly RouteMatch<Route>[],
    signal: AbortSignal,
    initial: Readonly<Record<string, unknown>> = {}
  ): Promise<{
    data: Record<string, unknown>;
    errors: Record<string, unknown>;
    headers: Record<string, Headers>;
    statusCode: number;
    redirect?: string;
    status?: number;
  }> {
    const data = { ...initial };
    const nextErrors: Record<string, unknown> = {};
    const headers: Record<string, Headers> = {};
    const results = await Promise.all(matches.map(async match => {
      try {
        await materializeLazy(match.route);
        if (!match.route.loader) return { match };
        const value = await match.route.loader({
          request: new Request(url),
          params: match.params,
          context: options.context,
          signal
        });
        const nextRedirect = redirectResult(value);
        if (nextRedirect) return { match, redirect: nextRedirect };
        return { match, value, data: await unwrapDataResult(value) };
      } catch (error) {
        const nextRedirect = redirectResult(error);
        if (nextRedirect) return { match, redirect: nextRedirect };
        return { match, error };
      }
    }));
    let redirect: { location: string; status: number } | undefined;
    let nextStatus = 200;
    for (const result of results) {
      if (result.redirect) {
        redirect = result.redirect;
        continue;
      }
      if ("error" in result) {
        nextErrors[result.match.id] = result.error;
        if (result.error instanceof Response) {
          headers[result.match.id] = new Headers(result.error.headers);
          nextStatus = result.error.status;
        } else {
          nextStatus = 500;
        }
        continue;
      }
      if (!("value" in result)) continue;
      data[result.match.id] = result.data;
      if (result.value instanceof Response) {
        headers[result.match.id] = new Headers(result.value.headers);
        nextStatus = result.value.status;
      }
    }
    return {
      data,
      errors: nextErrors,
      headers,
      statusCode: nextStatus,
      ...(redirect ? { redirect: redirect.location, status: redirect.status } : {})
    };
  }

  async function materializeLazy(route: Route): Promise<void> {
    if (!route.lazy) return;
    let pending = lazyPromises.get(route);
    if (!pending) {
      pending = route.lazy().then(values => { Object.assign(route, values, { lazy: undefined }); });
      lazyPromises.set(route, pending);
    }
    await pending;
  }

  function assertActive(): void {
    if (disposed) throw new Error("Cannot use a disposed router");
  }

  function beginAuthoritativeOperation(): Readonly<{ id: number; abort: AbortController }> {
    activeAbort?.abort();
    cancelIndependentRevalidation();
    const abort = new AbortController();
    activeAbort = abort;
    return { id: ++transitionId, abort };
  }

  function ownsAuthoritativeOperation(operation: Readonly<{ id: number; abort: AbortController }>): boolean {
    return operation.id === transitionId && activeAbort === operation.abort && !operation.abort.signal.aborted;
  }

  function beginIndependentRevalidation(): Readonly<{ id: number; abort: AbortController }> {
    revalidationAbort?.abort();
    const abort = new AbortController();
    revalidationAbort = abort;
    return { id: ++revalidationId, abort };
  }

  function cancelIndependentRevalidation(): void {
    revalidationAbort?.abort();
    revalidationAbort = undefined;
    revalidationId++;
    revalidation = "idle";
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
    sync(action = source.action?.() ?? "POP", publish = true) {
      assertActive();
      refresh(action, publish);
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
      revalidationAbort?.abort();
      for (const abort of fetcherAborts.values()) abort.abort();
      fetcherAborts.clear();
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

export function hydrationDataFromSnapshot(
  snapshot: ExactRouterSnapshot,
  limits: { maxDepth?: number; maxNodes?: number; maxBytes?: number } = {}
): ExactHydrationData {
  const data = {
    loaderData: snapshot.loaderData,
    actionData: snapshot.actionData,
    errors: snapshot.errors
  };
  assertJsonTransferSafe(data, limits);
  return data;
}

function assertJsonTransferSafe(
  value: unknown,
  limits: { maxDepth?: number; maxNodes?: number; maxBytes?: number }
): void {
  const maxDepth = positiveLimit(limits.maxDepth, 100);
  const maxNodes = positiveLimit(limits.maxNodes, 100_000);
  const maxBytes = positiveLimit(limits.maxBytes, 16 * 1024 * 1024);
  const pending: Array<{ value: unknown; path: string; depth: number }> = [{ value, path: "$", depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (++nodes > maxNodes || current.depth > maxDepth) throw new Error(`Route hydration data exceeded graph limits at ${current.path}`);
    const item = current.value;
    if (item === null || typeof item === "string" || typeof item === "boolean") continue;
    if (typeof item === "number") {
      if (Number.isFinite(item)) continue;
      throw new Error(`Route hydration data is not JSON-safe at ${current.path}`);
    }
    if (typeof item !== "object" || seen.has(item)) throw new Error(`Route hydration data is not JSON-safe at ${current.path}`);
    seen.add(item);
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype) {
      throw new Error(`Route hydration data is not JSON-safe at ${current.path}`);
    }
    for (const [key, child] of Object.entries(item)) {
      pending.push({ value: child, path: `${current.path}.${key}`, depth: current.depth + 1 });
    }
  }
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > maxBytes) {
    throw new Error("Route hydration data exceeded byte limits");
  }
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

async function unwrapDataResult(value: unknown): Promise<unknown> {
  if (!(value instanceof Response)) return value;
  if (value.status === 204 || value.status === 205) return null;
  const contentType = value.headers.get("Content-Type") ?? "";
  return contentType.includes("application/json") ? value.json() : value.text();
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
  let cursor = route.path?.startsWith("/") ? 0 : start;
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
