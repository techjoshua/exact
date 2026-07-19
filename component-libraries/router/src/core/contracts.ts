export type RouterMode = 'history' | 'hash';
export type HistoryAction = 'POP' | 'PUSH' | 'REPLACE';
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
export type ExactLazyRoute<
	Result extends object = Partial<
		Pick<ExactRouteDefinition, 'loader' | 'action' | 'shouldRevalidate' | 'handle'>
	>
> = () => Promise<Result>;
export type ExactHydrationData = Readonly<{
	loaderData?: Readonly<Record<string, unknown>>;
	actionData?: Readonly<Record<string, unknown>>;
	errors?: Readonly<Record<string, unknown>>;
}>;
export type ExactHydrationEnvelope = Readonly<{
	protocol: 1;
	key: string;
	location: string;
	matches: readonly string[];
	data: ExactHydrationData;
}>;
export type FetcherSnapshot = Readonly<{
	state: 'idle' | 'loading' | 'submitting';
	data?: unknown;
	error?: unknown;
}>;
export type NavigationBlocker = (
	transition: Readonly<{
		currentLocation: RouteLocation;
		nextLocation: RouteLocation;
		historyAction: HistoryAction;
	}>
) => boolean | string;

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

/** Creates the framework-neutral router state machine for a route tree. */
