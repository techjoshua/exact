/** Defines the router mode type contract. */
export type RouterMode = 'history' | 'hash';
/** Defines the history action type contract. */
export type HistoryAction = 'POP' | 'PUSH' | 'REPLACE';
/** Defines the route location type contract. */
export type RouteLocation = {
	pathname: string;
	search: string;
	hash: string;
	state?: unknown;
	key: string;
};
/** Configures navigation. */
export type NavigationOptions = {
	replace?: boolean;
	state?: unknown;
	status?: number;
};
/** Defines the route match type contract. */
export type RouteMatch<Route = ExactRouteDefinition> = {
	id: string;
	route: Route;
	path?: string;
	pathname: string;
	pathnameBase: string;
	params: Readonly<Record<string, string>>;
};
/** Defines the exact route definition type contract. */
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
/** Defines the exact data function args type contract. */
export type ExactDataFunctionArgs = Readonly<{
	request: Request;
	params: Readonly<Record<string, string>>;
	context: unknown;
	signal: AbortSignal;
}>;
/** Defines the exact route loader type contract. */
export type ExactRouteLoader = (args: ExactDataFunctionArgs) => unknown | Promise<unknown>;
/** Defines the exact route action type contract. */
export type ExactRouteAction = (args: ExactDataFunctionArgs) => unknown | Promise<unknown>;
/** Defines the exact should revalidate type contract. */
export type ExactShouldRevalidate = (
	args: Readonly<{
		currentUrl: URL;
		nextUrl: URL;
		currentParams: Readonly<Record<string, string>>;
		nextParams: Readonly<Record<string, string>>;
		actionResult?: unknown;
		defaultShouldRevalidate: boolean;
	}>
) => boolean;
/** Defines the exact lazy route type contract. */
export type ExactLazyRoute<
	Result extends object = Partial<
		Pick<ExactRouteDefinition, 'loader' | 'action' | 'shouldRevalidate' | 'handle'>
	>
> = () => Promise<Result>;
/** Defines the exact hydration data type contract. */
export type ExactHydrationData = Readonly<{
	loaderData?: Readonly<Record<string, unknown>>;
	actionData?: Readonly<Record<string, unknown>>;
	errors?: Readonly<Record<string, unknown>>;
}>;
/** Defines the exact hydration envelope type contract. */
export type ExactHydrationEnvelope = Readonly<{
	protocol: 1;
	key: string;
	location: string;
	matches: readonly string[];
	data: ExactHydrationData;
}>;
/** Defines the fetcher snapshot type contract. */
export type FetcherSnapshot = Readonly<{
	state: 'idle' | 'loading' | 'submitting';
	data?: unknown;
	error?: unknown;
}>;
/** Defines the navigation blocker type contract. */
export type NavigationBlocker = (
	transition: Readonly<{
		currentLocation: RouteLocation;
		nextLocation: RouteLocation;
		historyAction: HistoryAction;
	}>
) => boolean | string;

/** Defines the location source interface contract. */
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

/** Defines the exact router snapshot type contract. */
export type ExactRouterSnapshot<Route extends ExactRouteDefinition = ExactRouteDefinition> =
	Readonly<{
		location: RouteLocation;
		historyAction: HistoryAction;
		matches: readonly RouteMatch<Route>[];
		params: Readonly<Record<string, string>>;
		initialized: boolean;
		navigation: Readonly<{
			state: 'idle' | 'loading' | 'submitting';
			location?: RouteLocation;
			transitionId: number;
		}>;
		loaderData: Readonly<Record<string, unknown>>;
		actionData: Readonly<Record<string, unknown>>;
		errors: Readonly<Record<string, unknown>>;
		statusCode: number;
		loaderHeaders: Readonly<Record<string, Headers>>;
		actionHeaders: Readonly<Record<string, Headers>>;
		revalidation: 'idle' | 'loading';
		fetchers: ReadonlyMap<string, FetcherSnapshot>;
	}>;

/** Defines the exact router interface contract. */
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

/** Configures create exact router. */
export type CreateExactRouterOptions<Route extends ExactRouteDefinition> = {
	source: LocationSource;
	routes?: readonly Route[];
	basename?: string;
	mode?: RouterMode;
	context?: unknown;
	hydrationData?: ExactHydrationData;
};

/** Creates the framework-neutral router state machine for a route tree. */
