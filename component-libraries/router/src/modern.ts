import {
  Children,
  createContext,
  createElement,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactComponentType,
  type ReactElement,
  type ReactNode
} from "@exact/react-compat";
import { bridgeReactContext } from "@exact/react-compat/interop";
import {
  createExactRouter,
  createMemoryLocationSource,
  createBrowserLocationSource,
  generatePath,
  matchPath,
  matchRoutes as exactMatchRoutes,
  redirect as exactRedirect,
  RouterControllerContext,
  type ExactHydrationData,
  type ExactRouteDefinition,
  type ExactRouter,
  type ExactRouterSnapshot,
  type LocationSource,
  type NavigationOptions,
  type RouteLocation,
  type RouterMode
} from "./index.js";

export type To = string | Partial<Pick<RouteLocation, "pathname" | "search" | "hash">>;
export type NavigateOptions = NavigationOptions & { relative?: "route" | "path"; preventScrollReset?: boolean };
export type RouteObject = Omit<ExactRouteDefinition, "children"> & {
  element?: ReactNode;
  Component?: ReactComponentType<any>;
  errorElement?: ReactNode;
  ErrorBoundary?: ReactComponentType<any>;
  hydrateFallbackElement?: ReactNode;
  HydrateFallback?: ReactComponentType<any>;
  children?: readonly RouteObject[];
};
export type IndexRouteObject = RouteObject & { index: true };
export type NonIndexRouteObject = RouteObject & { index?: false };
export type RouterProviderProps = {
  router: ExactRouter<RouteObject>;
  fallbackElement?: ReactNode;
};
export const NavigationType = Object.freeze({ Pop: "POP", Push: "PUSH", Replace: "REPLACE" } as const);
export type StaticHandlerContext = Readonly<{
  location: RouteLocation;
  matches: ExactRouterSnapshot<RouteObject>["matches"];
  loaderData: Readonly<Record<string, unknown>>;
  actionData: Readonly<Record<string, unknown>>;
  errors: Readonly<Record<string, unknown>>;
  statusCode: number;
  loaderHeaders: Readonly<Record<string, Headers>>;
  actionHeaders: Readonly<Record<string, Headers>>;
}>;

const ReactRouterContext = bridgeReactContext(
  RouterControllerContext,
  null as unknown as ExactRouter<ExactRouteDefinition>
);
const OutletContext = createContext<ReactNode>(null);
const OutletValueContext = createContext<unknown>(undefined);
const RouteIdContext = createContext<string | undefined>(undefined);
const configuredRoutes = new WeakMap<ExactRouter<any>, unknown>();

function useRouter(): ExactRouter<RouteObject> {
  const router = useContext(ReactRouterContext);
  if (!router) throw new Error("React Router compatibility APIs must be rendered inside a router");
  return router as ExactRouter<RouteObject>;
}
export function useInRouterContext(): boolean { return !!useContext(ReactRouterContext); }

/** Renderer bridge used by versioned facades in this package, not a React Router public export. */
export function UNSAFE_useExactRouter(): ExactRouter<RouteObject> { return useRouter(); }

function useSnapshot(router = useRouter()): ExactRouterSnapshot<RouteObject> {
  return useSyncExternalStore(router.subscribe, router.getSnapshot, router.getSnapshot);
}

function ControllerProvider(props: { router: ExactRouter<RouteObject>; children?: ReactNode }): ReactNode {
  return createElement(ReactRouterContext.Provider, { value: props.router, children: props.children });
}

function createModeRouter(mode: RouterMode, basename: string | undefined, source?: LocationSource): ExactRouter<RouteObject> {
  const resolved = source ?? createBrowserLocationSource(mode);
  if (!resolved) throw new Error(`${mode === "hash" ? "HashRouter" : "BrowserRouter"} requires a browser`);
  return createExactRouter<RouteObject>({ source: resolved, basename, mode });
}

export function BrowserRouter(props: { basename?: string; children?: ReactNode; window?: Window }): ReactNode {
  const router = useMemo(() => createModeRouter("history", props.basename, props.window ? browserWindowSource(props.window, "history") : undefined), []);
  useEffect(() => () => router.dispose(), [router]);
  return createElement(ControllerProvider, { router, children: props.children });
}

export function HashRouter(props: { basename?: string; children?: ReactNode; window?: Window }): ReactNode {
  const router = useMemo(() => createModeRouter("hash", props.basename, props.window ? browserWindowSource(props.window, "hash") : undefined), []);
  useEffect(() => () => router.dispose(), [router]);
  return createElement(ControllerProvider, { router, children: props.children });
}

export function MemoryRouter(props: {
  basename?: string;
  children?: ReactNode;
  initialEntries?: readonly (string | Partial<RouteLocation>)[];
  initialIndex?: number;
}): ReactNode {
  const router = useMemo(() => createExactRouter<RouteObject>({
    source: createMemoryLocationSource(
      (props.initialEntries ?? ["/"]).map(entry => typeof entry === "string" ? entry : locationToString(entry)),
      props.initialIndex
    ),
    basename: props.basename
  }), []);
  useEffect(() => () => router.dispose(), [router]);
  return createElement(ControllerProvider, { router, children: props.children });
}

export function Router(props: {
  basename?: string;
  children?: ReactNode;
  location: string | Partial<RouteLocation>;
  navigationType?: "POP" | "PUSH" | "REPLACE";
  navigator: {
    createHref?(to: To): string;
    push(to: To, state?: unknown): void;
    replace(to: To, state?: unknown): void;
    go(delta: number): void;
    listen?(listener: () => void): () => void;
  };
}): ReactNode {
  const location = typeof props.location === "string" ? props.location : locationToString(props.location);
  const router = useMemo(() => createExactRouter<RouteObject>({
    basename: props.basename,
    source: {
      location: () => new URL(location, "http://exact.local"),
      push: (url, state) => props.navigator.push(url.pathname + url.search + url.hash, state),
      replace: (url, state) => props.navigator.replace(url.pathname + url.search + url.hash, state),
      go: delta => props.navigator.go(delta),
      subscribe: props.navigator.listen
    }
  }), [props.navigator]);
  useEffect(() => () => router.dispose(), [router]);
  return createElement(ControllerProvider, { router, children: props.children });
}

export function StaticRouter(props: {
  basename?: string;
  children?: ReactNode;
  location?: string | Partial<RouteLocation>;
}): ReactNode {
  return createElement(Router, {
    basename: props.basename,
    location: props.location ?? "/",
    navigator: {
      push() {},
      replace() {},
      go() {},
      createHref: (to: To) => toValue(to)
    },
    children: props.children
  });
}

export function Routes(props: { children?: ReactNode; location?: string | Partial<RouteLocation> }): ReactNode {
  const routes = useMemo(() => createRoutesFromChildren(props.children), [props.children]);
  return useRoutes(routes, props.location);
}

/** Declarative marker inspected by Routes/createRoutesFromElements. */
export function Route(_props: RouteObject & { children?: ReactNode }): null { return null; }

export function createRoutesFromChildren(children: ReactNode): RouteObject[] {
  const routes: RouteObject[] = [];
  for (const [index, child] of Children.toArray(children).entries()) {
    if (!isValidElement(child)) continue;
    if (child.type !== Route) throw new Error("Routes children must be Route elements");
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

export function useRoutes(routes: readonly RouteObject[], _location?: string | Partial<RouteLocation>): ReactNode {
  const router = useRouter();
  if (configuredRoutes.get(router) !== routes) {
    configuredRoutes.set(router, routes);
    router.setRoutes(routes);
  }
  return renderRouteMatches(useSnapshot(router));
}

export function RouterProvider(props: RouterProviderProps): ReactNode {
  const snapshot = useSnapshot(props.router);
  useEffect(() => { void props.router.initialize(); return () => props.router.dispose(); }, [props.router]);
  return createElement(ControllerProvider, {
    router: props.router,
    children: snapshot.initialized ? renderRouteMatches(snapshot) : props.fallbackElement ?? null
  });
}

export function createBrowserRouter(
  routes: readonly RouteObject[],
  options: { basename?: string; hydrationData?: ExactHydrationData; window?: Window } = {}
): ExactRouter<RouteObject> {
  const source = options.window ? browserWindowSource(options.window, "history") : createBrowserLocationSource("history");
  if (!source) throw new Error("createBrowserRouter requires a browser");
  return createExactRouter({ source, routes, basename: options.basename, hydrationData: options.hydrationData });
}

export function createHashRouter(
  routes: readonly RouteObject[],
  options: { basename?: string; hydrationData?: ExactHydrationData; window?: Window } = {}
): ExactRouter<RouteObject> {
  const source = options.window ? browserWindowSource(options.window, "hash") : createBrowserLocationSource("hash");
  if (!source) throw new Error("createHashRouter requires a browser");
  return createExactRouter({ source, routes, basename: options.basename, mode: "hash", hydrationData: options.hydrationData });
}

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
      (options.initialEntries ?? ["/"]).map(entry => typeof entry === "string" ? entry : locationToString(entry)),
      options.initialIndex
    ),
    routes,
    basename: options.basename,
    hydrationData: options.hydrationData
  });
}

export function Outlet(props: { context?: unknown }): ReactNode {
  const outlet = useContext(OutletContext);
  return createElement(OutletValueContext.Provider, { value: props.context, children: outlet });
}

export function useOutlet(context?: unknown): ReactNode {
  const outlet = useContext(OutletContext);
  return context === undefined ? outlet : createElement(OutletValueContext.Provider, { value: context, children: outlet });
}
export function useOutletContext<T = unknown>(): T { return useContext(OutletValueContext) as T; }
export function useLocation(): RouteLocation { return useSnapshot().location; }
export function useNavigationType(): "POP" | "PUSH" | "REPLACE" { return useSnapshot().historyAction; }
export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): Readonly<T> {
  return useSnapshot().params as Readonly<T>;
}
export function useNavigate(): (to: To | number, options?: NavigateOptions) => void | Promise<void> {
  const router = useRouter();
  const routeId = useContext(RouteIdContext);
  return (to, options) => router.navigate(
    typeof to === "number" ? to : resolveFacadeTo(to, router.getSnapshot(), routeId, options?.relative),
    options
  );
}
export function useHref(to: To, options?: { relative?: "route" | "path" }): string {
  const router = useRouter();
  const routeId = useContext(RouteIdContext);
  return router.createHref(resolveFacadeTo(to, router.getSnapshot(), routeId, options?.relative));
}
export function useResolvedPath(to: To): Pick<RouteLocation, "pathname" | "search" | "hash"> {
  const href = useHref(to);
  const url = new URL(href, "http://exact.local");
  return { pathname: url.pathname, search: url.search, hash: url.hash };
}
export function useMatch(pattern: Parameters<typeof matchPath>[0]): ReturnType<typeof matchPath> {
  return matchPath(pattern, useLocation().pathname);
}
export function useSearchParams(defaultInit?: string | URLSearchParams | Record<string, string>): readonly [
  URLSearchParams,
  (next: URLSearchParams | Record<string, string> | ((current: URLSearchParams) => URLSearchParams), options?: NavigateOptions) => void
] {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search || defaultInit);
  return [params, (next, options) => {
    const value = typeof next === "function" ? next(params) : new URLSearchParams(next);
    void navigate({ pathname: location.pathname, search: `?${value}`, hash: location.hash }, options);
  }] as const;
}
export function useMatches(): readonly Readonly<{
  id: string;
  pathname: string;
  params: Readonly<Record<string, string>>;
  data: unknown;
  handle: unknown;
}>[] {
  const snapshot = useSnapshot();
  return snapshot.matches.map(match => ({
    id: match.id,
    pathname: match.pathname,
    params: match.params,
    data: snapshot.loaderData[match.id],
    handle: match.route.handle
  }));
}

export function Navigate(props: { to: To; replace?: boolean; state?: unknown; relative?: "route" | "path" }): null {
  const navigate = useNavigate();
  useEffect(() => { void navigate(props.to, { replace: props.replace, state: props.state, relative: props.relative }); }, []);
  return null;
}

export function Link(props: Record<string, unknown> & {
  to: To;
  replace?: boolean;
  state?: unknown;
  reloadDocument?: boolean;
  children?: ReactNode;
  onClick?: (event: MouseEvent) => unknown;
}): ReactNode {
  const navigate = useNavigate();
  const href = useHref(props.to);
  const { to, replace, state, reloadDocument, onClick, ...rest } = props;
  return createElement("a", {
    ...rest,
    href,
    onClick: (event: MouseEvent) => {
      onClick?.(event);
      if (reloadDocument || !shouldHandleClick(event)) return;
      event.preventDefault();
      void navigate(to, { replace, state });
    }
  });
}

export function NavLink(props: Parameters<typeof Link>[0] & {
  end?: boolean;
  className?: string | ((state: { isActive: boolean; isPending: boolean; isTransitioning: boolean }) => string | undefined);
  style?: Record<string, unknown> | ((state: { isActive: boolean; isPending: boolean; isTransitioning: boolean }) => Record<string, unknown> | undefined);
}): ReactNode {
  const location = useLocation();
  const navigation = useNavigation();
  const resolved = useResolvedPath(props.to);
  const isActive = props.end
    ? location.pathname === resolved.pathname
    : location.pathname === resolved.pathname || location.pathname.startsWith(`${resolved.pathname.replace(/\/$/, "")}/`);
  const isPending = navigation.location?.pathname === resolved.pathname;
  const state = { isActive, isPending, isTransitioning: false };
  return createElement(Link, {
    ...props,
    "aria-current": isActive ? "page" : undefined,
    className: typeof props.className === "function" ? props.className(state) : props.className,
    style: typeof props.style === "function" ? props.style(state) : props.style
  });
}

export function useNavigation(): ExactRouterSnapshot<RouteObject>["navigation"] { return useSnapshot().navigation; }
export function useLoaderData<T = unknown>(): T {
  const id = useContext(RouteIdContext);
  return useSnapshot().loaderData[id ?? ""] as T;
}
export function useActionData<T = unknown>(): T | undefined {
  const id = useContext(RouteIdContext);
  return useSnapshot().actionData[id ?? ""] as T | undefined;
}
export function useRouteError(): unknown {
  const id = useContext(RouteIdContext);
  return useSnapshot().errors[id ?? ""];
}
export function useRouteLoaderData<T = unknown>(routeId: string): T | undefined {
  return useSnapshot().loaderData[routeId] as T | undefined;
}
export function useRevalidator(): { revalidate(): Promise<void>; state: "idle" | "loading" } {
  const router = useRouter();
  const snapshot = useSnapshot(router);
  return { revalidate: () => router.revalidate(), state: snapshot.revalidation };
}

export function useBlocker(
  shouldBlock: boolean | ((args: {
    currentLocation: RouteLocation;
    nextLocation: RouteLocation;
    historyAction: "POP" | "PUSH" | "REPLACE";
  }) => boolean)
): {
  state: "unblocked" | "blocked" | "proceeding";
  location?: RouteLocation;
  proceed?(): void;
  reset?(): void;
} {
  const router = useRouter();
  const bypass = useRef(false);
  const [blocked, setBlocked] = useState<{
    state: "unblocked" | "blocked" | "proceeding";
    location?: RouteLocation;
    proceed?(): void;
    reset?(): void;
  }>({ state: "unblocked" });
  useEffect(() => router.block(transition => {
    if (bypass.current) { bypass.current = false; return false; }
    const active = typeof shouldBlock === "function" ? shouldBlock(transition) : shouldBlock;
    if (!active) return false;
    const reset = () => setBlocked({ state: "unblocked" });
    const proceed = () => {
      setBlocked({ state: "proceeding", location: transition.nextLocation });
      bypass.current = true;
      void router.navigate(locationToString(transition.nextLocation), {
        replace: transition.historyAction === "REPLACE",
        state: transition.nextLocation.state
      }).finally(reset);
    };
    setBlocked({ state: "blocked", location: transition.nextLocation, proceed, reset });
    return true;
  }), [router, shouldBlock]);
  return blocked;
}

export function unstable_usePrompt(options: { when: boolean | Parameters<typeof useBlocker>[0]; message: string }): void {
  const blocker = useBlocker(options.when);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (typeof window !== "undefined" && window.confirm(options.message)) blocker.proceed?.();
    else blocker.reset?.();
  }, [blocker.state, options.message]);
}

export function useBeforeUnload(callback: (event: BeforeUnloadEvent) => unknown, options?: AddEventListenerOptions): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("beforeunload", callback, options);
    return () => window.removeEventListener("beforeunload", callback, options);
  }, [callback, options]);
}

export function useFormAction(action = ".", _options?: { relative?: "route" | "path" }): string {
  return useHref(action);
}

export function useLinkClickHandler<T extends Element = HTMLAnchorElement>(
  to: To,
  options: NavigateOptions & { target?: string } = {}
): (event: MouseEvent & { currentTarget: T }) => void {
  const navigate = useNavigate();
  return event => {
    if (options.target && options.target !== "_self" || !shouldHandleClick(event)) return;
    event.preventDefault();
    void navigate(to, options);
  };
}

export function ScrollRestoration(props: { getKey?: (location: RouteLocation, matches: ReturnType<typeof useMatches>) => string }): null {
  const location = useLocation();
  const matches = useMatches();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = props.getKey?.(location, matches) ?? location.key;
    const saved = scrollPositions.get(key);
    if (saved) window.scrollTo(saved[0], saved[1]);
    return () => { scrollPositions.set(key, [window.scrollX, window.scrollY]); };
  }, [location.key]);
  return null;
}
const scrollPositions = new Map<string, readonly [number, number]>();

export function useSubmit(): (
  target: HTMLFormElement | FormData | URLSearchParams | Record<string, string>,
  options?: { action?: string; method?: string; encType?: string; replace?: boolean }
) => Promise<void> {
  const router = useRouter();
  const location = useLocation();
  return async (target, options = {}) => {
    const formData = target instanceof HTMLFormElement ? new FormData(target)
      : target instanceof FormData ? target
      : target instanceof URLSearchParams ? target
      : new URLSearchParams(target);
    const method = (options.method ?? (target instanceof HTMLFormElement ? target.method : "get")).toUpperCase();
    const action = options.action ?? (target instanceof HTMLFormElement ? target.action : location.pathname);
    if (method === "GET") {
      const search = formData instanceof FormData ? formDataSearchParams(formData) : formData;
      await router.navigate(`${action}?${search}`, { replace: options.replace });
    } else {
      await router.submit(action, { method, body: formData });
    }
  };
}

export function Form(props: Record<string, unknown> & {
  action?: string;
  method?: string;
  encType?: string;
  replace?: boolean;
  reloadDocument?: boolean;
  onSubmit?: (event: SubmitEvent) => unknown;
  children?: ReactNode;
}): ReactNode {
  const submit = useSubmit();
  const { replace, reloadDocument, onSubmit, ...rest } = props;
  return createElement("form", {
    ...rest,
    onSubmit: (event: SubmitEvent) => {
      onSubmit?.(event);
      if (reloadDocument || event.defaultPrevented) return;
      event.preventDefault();
      void submit(event.currentTarget as HTMLFormElement, {
        action: props.action,
        method: props.method,
        encType: props.encType,
        replace
      });
    }
  });
}

export function useFetcher<T = unknown>(): {
  state: "idle" | "loading" | "submitting";
  data?: T;
  error?: unknown;
  load(href: string): Promise<void>;
  submit(target: FormData | URLSearchParams | Record<string, string>, options?: { action?: string; method?: string }): Promise<void>;
  Form: ReactComponentType<Parameters<typeof Form>[0]>;
} {
  const router = useRouter();
  const snapshot = useSnapshot(router);
  const routeId = useContext(RouteIdContext);
  const generated = useId();
  const [key] = useState(() => `fetcher-${generated}`);
  const state = snapshot.fetchers.get(key) ?? { state: "idle" as const };
  if (!routeId) throw new Error("useFetcher must be used within a matched route");
  return {
    ...state,
    data: state.data as T | undefined,
    load: href => router.fetch(key, routeId, href),
    submit: async (target, options = {}) => {
      const body = target instanceof FormData || target instanceof URLSearchParams ? target : new URLSearchParams(target);
      await router.fetch(key, routeId, options.action ?? snapshot.location.pathname, {
        method: options.method ?? "POST",
        body
      });
    },
    Form: props => createElement(Form, props)
  };
}

export function useFetchers(): readonly Readonly<{ key: string; state: string; data?: unknown; error?: unknown }>[] {
  return [...useSnapshot().fetchers].map(([key, fetcher]) => ({ key, ...fetcher }));
}

export function createStaticHandler(routes: readonly RouteObject[], options: { basename?: string } = {}): {
  dataRoutes: readonly RouteObject[];
  query(request: Request, init?: { requestContext?: unknown }): Promise<Response | StaticHandlerContext>;
  queryRoute(request: Request, options?: { routeId?: string; requestContext?: unknown }): Promise<unknown>;
} {
  return {
    dataRoutes: routes,
    async query(request, init = {}) {
      const statics = createStaticLocationSource(request.url);
      const router = createExactRouter({ source: statics.source, routes, basename: options.basename, context: init.requestContext });
      if (!/^(?:GET|HEAD)$/i.test(request.method)) {
        await router.submit(request.url, await requestInit(request));
      } else {
        await router.initialize();
      }
      const redirected = statics.redirect();
      if (redirected) {
        router.dispose();
        return new Response(null, { status: redirected.status, headers: { Location: redirected.location.href } });
      }
      const snapshot = router.getSnapshot();
      const context: StaticHandlerContext = {
        location: snapshot.location,
        matches: snapshot.matches,
        loaderData: snapshot.loaderData,
        actionData: snapshot.actionData,
        errors: snapshot.errors,
        statusCode: routeErrorStatus(snapshot.errors),
        loaderHeaders: {},
        actionHeaders: {}
      };
      router.dispose();
      return context;
    },
    async queryRoute(request, queryOptions = {}) {
      const statics = createStaticLocationSource(request.url);
      const router = createExactRouter({ source: statics.source, routes, basename: options.basename, context: queryOptions.requestContext });
      if (/^(?:GET|HEAD)$/i.test(request.method)) await router.initialize();
      else await router.submit(request.url, await requestInit(request));
      const redirected = statics.redirect();
      if (redirected) {
        router.dispose();
        return new Response(null, { status: redirected.status, headers: { Location: redirected.location.href } });
      }
      const snapshot = router.getSnapshot();
      const routeId = queryOptions.routeId ?? snapshot.matches.at(-1)?.id ?? "";
      const value = /^(?:GET|HEAD)$/i.test(request.method) ? snapshot.loaderData[routeId] : snapshot.actionData[routeId];
      router.dispose();
      return value;
    }
  };
}

export function createStaticRouter(
  routes: readonly RouteObject[],
  context: StaticHandlerContext
): ExactRouter<RouteObject> {
  return createExactRouter({
    source: createMemoryLocationSource(locationToString(context.location)),
    routes,
    hydrationData: {
      loaderData: context.loaderData,
      actionData: context.actionData,
      errors: context.errors
    }
  });
}

export function StaticRouterProvider(props: {
  router: ExactRouter<RouteObject>;
  context: StaticHandlerContext;
  hydrate?: boolean;
  nonce?: string;
}): ReactNode {
  return createElement(RouterProvider, { router: props.router });
}

const AsyncValueContext = createContext<unknown>(undefined);
const AsyncErrorContext = createContext<unknown>(undefined);
export function Await(props: {
  resolve: unknown;
  errorElement?: ReactNode;
  children?: ReactNode | ((value: unknown) => ReactNode);
}): ReactNode {
  if (props.resolve instanceof Promise) throw props.resolve;
  const children = typeof props.children === "function" ? props.children(props.resolve) : props.children;
  return createElement(AsyncValueContext.Provider, { value: props.resolve, children });
}
export function useAsyncValue<T = unknown>(): T { return useContext(AsyncValueContext) as T; }
export function useAsyncError(): unknown { return useContext(AsyncErrorContext); }
export function defer<T extends Record<string, unknown>>(data: T): T { return data; }
export function json<T>(data: T, init?: number | ResponseInit): Response {
  return Response.json(data, typeof init === "number" ? { status: init } : init);
}
export function redirect(location: string, init: number | ResponseInit = 302): Response {
  const response = typeof init === "number" ? exactRedirect(location, init) : exactRedirect(location, init.status ?? 302);
  if (typeof init !== "number") new Headers(init.headers).forEach((value, name) => response.headers.set(name, value));
  return response;
}
export function redirectDocument(location: string, init: number | ResponseInit = 302): Response {
  const response = redirect(location, init);
  response.headers.set("X-Remix-Reload-Document", "true");
  return response;
}
export function replace(location: string, init: number | ResponseInit = 302): Response {
  const response = redirect(location, init);
  response.headers.set("X-Remix-Replace", "true");
  return response;
}
export function isRouteErrorResponse(value: unknown): value is Response | { status: number; statusText: string; data: unknown } {
  return value instanceof Response || !!value && typeof value === "object"
    && typeof (value as any).status === "number" && "data" in value;
}
export function useViewTransitionState(_to: To, _options?: { relative?: "route" | "path" }): boolean { return false; }
export function createSearchParams(
  init: string | URLSearchParams | readonly (readonly [string, string])[] | Record<string, string | readonly string[]> = ""
): URLSearchParams {
  if (typeof init === "string" || init instanceof URLSearchParams || Array.isArray(init)) return new URLSearchParams(init as any);
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(init)) {
    if (Array.isArray(value)) value.forEach(item => params.append(name, item));
    else params.set(name, value as string);
  }
  return params;
}
export function createPath(value: Partial<Pick<RouteLocation, "pathname" | "search" | "hash">>): string {
  const pathname = value.pathname || "/";
  const search = value.search && value.search !== "?" ? value.search.startsWith("?") ? value.search : `?${value.search}` : "";
  const hash = value.hash && value.hash !== "#" ? value.hash.startsWith("#") ? value.hash : `#${value.hash}` : "";
  return `${pathname}${search}${hash}`;
}
export function parsePath(value: string): Partial<Pick<RouteLocation, "pathname" | "search" | "hash">> {
  const parsed: Partial<Pick<RouteLocation, "pathname" | "search" | "hash">> = {};
  const hashIndex = value.indexOf("#");
  if (hashIndex >= 0) { parsed.hash = value.slice(hashIndex); value = value.slice(0, hashIndex); }
  const searchIndex = value.indexOf("?");
  if (searchIndex >= 0) { parsed.search = value.slice(searchIndex); value = value.slice(0, searchIndex); }
  if (value) parsed.pathname = value;
  return parsed;
}
export function resolvePath(to: To, fromPathname = "/"): Pick<RouteLocation, "pathname" | "search" | "hash"> {
  const value = typeof to === "string" ? parsePath(to) : to;
  const pathname = value.pathname
    ? value.pathname.startsWith("/") ? value.pathname : new URL(value.pathname, `http://exact.local${fromPathname.endsWith("/") ? fromPathname : `${fromPathname}/`}`).pathname
    : fromPathname;
  return { pathname, search: value.search ?? "", hash: value.hash ?? "" };
}
export function matchRoutes(
  routes: readonly RouteObject[],
  location: string | Partial<RouteLocation>,
  basename = "/"
): readonly { params: Readonly<Record<string, string>>; pathname: string; pathnameBase: string; route: RouteObject }[] | null {
  const pathname = typeof location === "string" ? parsePath(location).pathname ?? "/" : location.pathname ?? "/";
  const publicPath = basename === "/" ? pathname : pathname.toLowerCase().startsWith(basename.toLowerCase())
    ? pathname.slice(basename.length) || "/"
    : pathname;
  const matches = exactMatchRoutes(routes, publicPath);
  return matches.length ? matches.map(match => ({
    params: match.params,
    pathname: match.pathname,
    pathnameBase: match.pathnameBase,
    route: match.route
  })) : null;
}
export function renderMatches(
  matches: readonly { params: Readonly<Record<string, string>>; pathname: string; pathnameBase: string; route: RouteObject }[] | null
): ReactNode {
  if (!matches?.length) return null;
  let outlet: ReactNode = null;
  for (let index = matches.length - 1; index >= 0; index--) {
    const match = matches[index]!;
    const element: ReactNode = match.route.Component ? createElement(match.route.Component, {}) : match.route.element ?? outlet;
    outlet = createElement(OutletContext.Provider, { value: outlet, children: element });
  }
  return outlet;
}
export function unstable_HistoryRouter(props: { basename?: string; children?: ReactNode; history: any }): ReactNode {
  return createElement(Router, {
    basename: props.basename,
    location: props.history.location,
    navigationType: props.history.action,
    navigator: props.history,
    children: props.children
  });
}
export const HistoryRouter = unstable_HistoryRouter;

export { generatePath, matchPath };
export type { ExactHydrationData };

function renderRouteMatches(snapshot: ExactRouterSnapshot<RouteObject>): ReactNode {
  if (!snapshot.matches.length) return null;
  const errorMatch = [...snapshot.matches].reverse().find(match => snapshot.errors[match.id] !== undefined);
  if (errorMatch) {
    const boundary = [...snapshot.matches.slice(0, snapshot.matches.indexOf(errorMatch) + 1)]
      .reverse()
      .find(match => match.route.errorElement !== undefined || match.route.ErrorBoundary);
    if (boundary) return routeProvider(boundary.id, boundary.route.ErrorBoundary
      ? createElement(boundary.route.ErrorBoundary, {})
      : boundary.route.errorElement);
  }
  let outlet: ReactNode = null;
  for (let index = snapshot.matches.length - 1; index >= 0; index--) {
    const match = snapshot.matches[index]!;
    const element: ReactNode = match.route.Component ? createElement(match.route.Component, {}) : match.route.element ?? outlet;
    outlet = createElement(OutletContext.Provider, {
      value: outlet,
      children: routeProvider(match.id, element)
    });
  }
  return outlet;
}

function routeProvider(id: string, children: ReactNode): ReactNode {
  return createElement(RouteIdContext.Provider, { value: id, children });
}

function toValue(to: To): string {
  return typeof to === "string" ? to : locationToString(to);
}
function resolveFacadeTo(
  to: To,
  snapshot: ExactRouterSnapshot<RouteObject>,
  routeId: string | undefined,
  relative: "route" | "path" | undefined
): string {
  const value = toValue(to);
  if (relative === "path" || value.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(value) || !routeId) return value;
  const parts = value.split("/");
  let parents = 0;
  while (parts[0] === "..") { parents++; parts.shift(); }
  if (!parents && parts[0] !== ".") return value;
  if (parts[0] === ".") parts.shift();
  const currentIndex = snapshot.matches.findIndex(match => match.id === routeId);
  const targetIndex = Math.max(0, currentIndex - parents);
  const base = snapshot.matches[targetIndex]?.pathnameBase ?? "/";
  if (!parts.length) return base || "/";
  return `${base.replace(/\/$/, "")}/${parts.join("/")}`.replace(/\/{2,}/g, "/") || "/";
}
function locationToString(location: Partial<Pick<RouteLocation, "pathname" | "search" | "hash">>): string {
  return `${location.pathname ?? ""}${location.search ?? ""}${location.hash ?? ""}` || "/";
}
function shouldHandleClick(event: MouseEvent): boolean {
  const anchor = (event.currentTarget ?? event.target) as HTMLAnchorElement | null;
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    && (!anchor?.target || anchor.target === "_self") && !anchor?.hasAttribute("download");
}
function formDataSearchParams(formData: FormData): URLSearchParams {
  const params = new URLSearchParams();
  formData.forEach((value, name) => params.append(name, String(value)));
  return params;
}
function createStaticLocationSource(initial: string | URL): {
  source: LocationSource;
  redirect(): { location: URL; status: number } | undefined;
} {
  let location = new URL(initial);
  let redirected: { location: URL; status: number } | undefined;
  const listeners = new Set<(action?: "POP" | "PUSH" | "REPLACE") => void>();
  const update = (next: URL, status: number | undefined, action: "PUSH" | "REPLACE") => {
    location = next;
    redirected = { location: next, status: status ?? 302 };
    listeners.forEach(listener => listener(action));
  };
  return {
    source: {
      location: () => location,
      push: (url, _state, status) => update(url, status, "PUSH"),
      replace: (url, _state, status) => update(url, status, "REPLACE"),
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
    },
    redirect: () => redirected
  };
}
async function requestInit(request: Request): Promise<RequestInit> {
  const body = await request.clone().arrayBuffer();
  return {
    method: request.method,
    headers: request.headers,
    ...(body.byteLength ? { body } : {})
  };
}
function routeErrorStatus(errors: Readonly<Record<string, unknown>>): number {
  const responses = Object.values(errors).filter((error): error is Response => error instanceof Response);
  return responses.find(response => response.status >= 400)?.status ?? (Object.keys(errors).length ? 500 : 200);
}
function browserWindowSource(target: Window, mode: RouterMode): LocationSource {
  const read = () => mode === "hash"
    ? new URL(target.location.hash.slice(1) || "/", target.location.origin)
    : new URL(target.location.href);
  return {
    location: read,
    state: () => target.history.state?.usr,
    key: () => String(target.history.state?.key ?? "default"),
    push(url, state) { target.history.pushState({ usr: state }, "", mode === "hash" ? `#${url.pathname}${url.search}${url.hash}` : url); },
    replace(url, state) { target.history.replaceState({ usr: state }, "", mode === "hash" ? `#${url.pathname}${url.search}${url.hash}` : url); },
    go: delta => target.history.go(delta),
    subscribe(listener) {
      const event = mode === "hash" ? "hashchange" : "popstate";
      const handle = () => listener("POP");
      target.addEventListener(event, handle);
      return () => target.removeEventListener(event, handle);
    }
  };
}
