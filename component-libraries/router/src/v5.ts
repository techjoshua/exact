import {
  Children,
  cloneElement,
  createContext,
  createElement,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  type ReactComponentType,
  type ReactElement,
  type ReactNode
} from "@exact/react-compat";
import {
  BrowserRouter,
  HashRouter,
  Link as ModernLink,
  MemoryRouter,
  Router as ModernRouter,
  generatePath,
  useLocation,
  useNavigate,
  useNavigationType,
  useResolvedPath,
  UNSAFE_useExactRouter,
  type NavigateOptions,
  type To
} from "./modern.js";
import { matchPath as exactMatchPath, type RouteLocation } from "./index.js";

export { BrowserRouter, HashRouter, MemoryRouter, generatePath, useLocation };

export type V5Match<Params extends Record<string, string | undefined> = Record<string, string | undefined>> = {
  path: string;
  url: string;
  isExact: boolean;
  params: Params;
};
export type RouteComponentProps<Params extends Record<string, string | undefined> = Record<string, string | undefined>> = {
  history: V5History;
  location: RouteLocation;
  match: V5Match<Params> | null;
  staticContext?: unknown;
};
export type V5History = {
  readonly length: number;
  readonly action: "POP" | "PUSH" | "REPLACE";
  readonly location: RouteLocation;
  push(to: To, state?: unknown): void;
  replace(to: To, state?: unknown): void;
  go(delta: number): void;
  goBack(): void;
  goForward(): void;
  listen(listener: (location: RouteLocation, action: "POP" | "PUSH" | "REPLACE") => void): () => void;
  block(prompt?: string | ((location: RouteLocation, action: "POP" | "PUSH" | "REPLACE") => string | boolean)): () => void;
  createHref(to: To): string;
};
export type RouteProps = {
  path?: string | readonly string[];
  exact?: boolean;
  strict?: boolean;
  sensitive?: boolean;
  component?: ReactComponentType<RouteComponentProps<any>>;
  render?: (props: RouteComponentProps<any>) => ReactNode;
  children?: ReactNode | ((props: RouteComponentProps<any>) => ReactNode);
  computedMatch?: V5Match | null;
  location?: RouteLocation;
};

const MatchContext = createContext<Readonly<{ match: V5Match | null; location: RouteLocation }> | null>(null);

export function Router(props: { history: any; children?: ReactNode }): ReactNode {
  const location = historyLocation(props.history.location);
  return createElement(ModernRouter, {
    location,
    navigationType: normalizeAction(props.history.action),
    navigator: {
      push: (to: To, state?: unknown) => props.history.push(to, state),
      replace: (to: To, state?: unknown) => props.history.replace(to, state),
      go: (delta: number) => props.history.go(delta),
      listen: (listener: () => void) => props.history.listen(listener),
      createHref: (to: To) => props.history.createHref(to)
    },
    children: props.children
  });
}

export function StaticRouter(props: {
  basename?: string;
  children?: ReactNode;
  context?: Record<string, unknown>;
  location?: string | Partial<RouteLocation>;
}): ReactNode {
  const context = props.context ?? {};
  const location = props.location ?? "/";
  return createElement(ModernRouter, {
    basename: props.basename,
    location,
    navigator: {
      push(to: To) { recordStaticNavigation(context, to, "PUSH"); },
      replace(to: To) { recordStaticNavigation(context, to, "REPLACE"); },
      go() {},
      createHref: toString
    },
    children: props.children
  });
}

export function Switch(props: { children?: ReactNode; location?: RouteLocation }): ReactNode {
  const location = props.location ?? useLocation();
  for (const child of Children.toArray(props.children)) {
    if (!isValidElement(child)) continue;
    const routeProps = child.props as RouteProps & { from?: string };
    const path = routeProps.path ?? routeProps.from;
    const match = path === undefined ? rootMatch(location.pathname) : matchPath(location.pathname, routeProps);
    if (match) return cloneElement(child, { computedMatch: match, location } as never);
  }
  return null;
}

export function Route(props: RouteProps): ReactNode {
  const location = props.location ?? useLocation();
  const match = props.computedMatch !== undefined
    ? props.computedMatch
    : props.path === undefined ? rootMatch(location.pathname) : matchPath(location.pathname, props);
  const routeProps: RouteComponentProps = {
    history: useHistory(),
    location,
    match
  };
  let output: ReactNode = null;
  if (match) {
    if (props.component) output = createElement(props.component, routeProps);
    else if (props.render) output = props.render(routeProps);
    else if (typeof props.children !== "function") output = props.children;
  }
  if (typeof props.children === "function") output = props.children(routeProps);
  return createElement(MatchContext.Provider, { value: { match, location }, children: output });
}

export function Redirect(props: {
  to: To | ((location: RouteLocation) => To);
  push?: boolean;
  from?: string;
  exact?: boolean;
  strict?: boolean;
  sensitive?: boolean;
}): null {
  const location = useLocation();
  const navigate = useNavigate();
  const match = props.from ? matchPath(location.pathname, { path: props.from, ...props }) : rootMatch(location.pathname);
  useEffect(() => {
    if (!match) return;
    const target = typeof props.to === "function" ? props.to(location) : props.to;
    void navigate(target, { replace: !props.push });
  }, [match?.url]);
  return null;
}

export function Link(props: Parameters<typeof ModernLink>[0] & { innerRef?: unknown }): ReactNode {
  const { innerRef, ...rest } = props;
  return createElement(ModernLink, { ...rest, ref: innerRef });
}

export function NavLink(props: Parameters<typeof Link>[0] & {
  activeClassName?: string;
  activeStyle?: Record<string, unknown>;
  exact?: boolean;
  strict?: boolean;
  isActive?: (match: V5Match | null, location: RouteLocation) => boolean;
}): ReactNode {
  const location = useLocation();
  const resolved = useResolvedPath(props.to);
  const match = matchPath(location.pathname, {
    path: resolved.pathname,
    exact: props.exact,
    strict: props.strict
  });
  const active = props.isActive ? props.isActive(match, location) : !!match;
  const {
    activeClassName = "active",
    activeStyle,
    exact: _exact,
    strict: _strict,
    isActive: _isActive,
    className,
    style,
    ...rest
  } = props;
  return createElement(Link, {
    ...rest,
    "aria-current": active ? "page" : undefined,
    className: [className, active ? activeClassName : undefined].filter(Boolean).join(" ") || undefined,
    style: active ? { ...(style as object ?? {}), ...activeStyle } : style
  });
}

export function Prompt(props: {
  when?: boolean;
  message: string | ((location: RouteLocation, action: "POP" | "PUSH" | "REPLACE") => string | boolean);
}): null {
  const history = useHistory();
  useEffect(() => {
    if (props.when === false) return;
    return history.block(props.message);
  }, [history, props.when, props.message]);
  return null;
}

export function useHistory(): V5History {
  const router = UNSAFE_useExactRouter();
  const navigate = useNavigate();
  useLocation();
  useNavigationType();
  return useMemo(() => ({
    get length() { return typeof window === "undefined" ? 1 : window.history.length; },
    get action() { return router.getSnapshot().historyAction; },
    get location() { return router.getSnapshot().location; },
    push: (to: To, state?: unknown) => { void navigate(to, { state }); },
    replace: (to: To, state?: unknown) => { void navigate(to, { replace: true, state }); },
    go: (delta: number) => { void navigate(delta); },
    goBack: () => { void navigate(-1); },
    goForward: () => { void navigate(1); },
    listen: (listener: (location: RouteLocation, action: "POP" | "PUSH" | "REPLACE") => void) =>
      router.subscribe(() => listener(router.getSnapshot().location, router.getSnapshot().historyAction)),
    block: (prompt?: string | ((location: RouteLocation, action: "POP" | "PUSH" | "REPLACE") => string | boolean)) =>
      router.block(transition => {
        const result = typeof prompt === "function"
          ? prompt(transition.nextLocation, transition.historyAction)
          : prompt;
        if (typeof result === "string") return typeof window === "undefined" || !window.confirm(result);
        return result === false;
      }),
    createHref: (to: To) => router.createHref(toString(to))
  }), [router]);
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  return (useContext(MatchContext)?.match?.params ?? {}) as T;
}

export function useRouteMatch<Params extends Record<string, string | undefined> = Record<string, string | undefined>>(
  path?: string | readonly string[] | Omit<RouteProps, "component" | "render" | "children">
): V5Match<Params> | null {
  const inherited = useContext(MatchContext)?.match;
  const location = useLocation();
  if (path === undefined) return inherited as V5Match<Params> | null;
  const props = typeof path === "string" || Array.isArray(path) ? { path } : path;
  return matchPath(location.pathname, props as RouteProps) as V5Match<Params> | null;
}

export function withRouter<P extends RouteComponentProps<any>>(
  Component: ReactComponentType<P>
): ReactComponentType<Omit<P, keyof RouteComponentProps<any>>> {
  function WithRouter(props: Omit<P, keyof RouteComponentProps<any>>): ReactNode {
    UNSAFE_useExactRouter();
    const routed = useContext(MatchContext);
    const current = useLocation();
    const location = routed?.match?.isExact
      ? { ...current, pathname: routed.match.url }
      : routed?.location ?? current;
    return createElement(Component, {
      ...props,
      history: useHistory(),
      location,
      match: routed?.match ?? rootMatch(location.pathname)
    } as P);
  }
  return WithRouter;
}

export function matchPath<Params extends Record<string, string | undefined> = Record<string, string | undefined>>(
  pathname: string,
  options: string | readonly string[] | Pick<RouteProps, "path" | "exact" | "strict" | "sensitive">
): V5Match<Params> | null {
  const config: Pick<RouteProps, "path" | "exact" | "strict" | "sensitive"> =
    typeof options === "string" || Array.isArray(options)
      ? { path: options as string | readonly string[] }
      : options as Pick<RouteProps, "path" | "exact" | "strict" | "sensitive">;
  const paths = typeof config.path === "string" ? [config.path] : config.path ?? [];
  for (const path of paths) {
    const match = exactMatchPath({ path, caseSensitive: config.sensitive, end: config.exact ?? false }, pathname);
    if (!match) continue;
    return {
      path,
      url: match.pathname,
      isExact: match.pathname === pathname,
      params: match.params as Params
    };
  }
  return null;
}

function rootMatch(pathname: string): V5Match {
  return { path: "/", url: "/", isExact: pathname === "/", params: {} };
}
function normalizeAction(value: unknown): "POP" | "PUSH" | "REPLACE" {
  return value === "PUSH" || value === "REPLACE" ? value : "POP";
}
function historyLocation(value: any): Partial<RouteLocation> {
  return typeof value === "string" ? { pathname: value } : value ?? { pathname: "/" };
}
function toString(to: To): string {
  return typeof to === "string" ? to : `${to.pathname ?? ""}${to.search ?? ""}${to.hash ?? ""}` || "/";
}
function recordStaticNavigation(context: Record<string, unknown>, to: To, action: "PUSH" | "REPLACE"): void {
  const url = toString(to);
  context.action = action;
  context.location = { pathname: url };
  context.url = url;
}
