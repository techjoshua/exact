import {
	createElement,
	useContext,
	useEffect,
	useRef,
	useState,
	type ReactNode
} from '@exactjs/react-compat';
import {
	matchPath,
	type ExactRouter,
	type ExactRouterSnapshot,
	type RouteLocation
} from '../core.js';
import { shouldHandleClick } from './browser.js';
import {
	OutletContext,
	OutletValueContext,
	RouteErrorContext,
	RouteIdContext,
	useRouter,
	useSnapshot,
	type NavigateOptions,
	type RouteObject
} from './context.js';
import { locationToString, resolveRouteRelativeTo, type To } from './paths.js';

export { createPath, createSearchParams, parsePath, resolvePath } from './paths.js';
/** Performs the outlet domain operation. */
export function Outlet(props: { context?: unknown }): ReactNode {
	const outlet = useContext(OutletContext);
	return createElement(OutletValueContext.Provider, { value: props.context, children: outlet });
}

/** Returns the rendered child-route outlet for the current match. */
export function useOutlet(context?: unknown): ReactNode {
	const outlet = useContext(OutletContext);
	return context === undefined
		? outlet
		: createElement(OutletValueContext.Provider, { value: context, children: outlet });
}
/** Reads the value supplied to the nearest route outlet. */
export function useOutletContext<T = unknown>(): T {
	return useContext(OutletValueContext) as T;
}
/** Returns the router's current normalized location. */
export function useLocation(): RouteLocation {
	return useSnapshot().location;
}
/** Returns the history action that produced the current location. */
export function useNavigationType(): 'POP' | 'PUSH' | 'REPLACE' {
	return useSnapshot().historyAction;
}
/** Returns parameters for the deepest active route match. */
export function useParams<
	T extends Record<string, string | undefined> = Record<string, string | undefined>
>(): Readonly<T> {
	return useSnapshot().params as Readonly<T>;
}
/** Returns a function for path or history-delta navigation. */
export function useNavigate(): (
	to: To | number,
	options?: NavigateOptions
) => void | Promise<void> {
	const router = useRouter();
	const routeId = useContext(RouteIdContext);
	return (to, options) =>
		router.navigate(
			typeof to === 'number'
				? to
				: resolveRouteRelativeTo(to, router.getSnapshot(), routeId, options?.relative),
			options
		);
}
/** Resolves a destination to an href appropriate for the active router mode. */
export function useHref(to: To, options?: { relative?: 'route' | 'path' }): string {
	const router = useRouter();
	const routeId = useContext(RouteIdContext);
	return router.createHref(
		resolveRouteRelativeTo(to, router.getSnapshot(), routeId, options?.relative)
	);
}
/** Resolves a destination without initiating navigation. */
export function useResolvedPath(to: To): Pick<RouteLocation, 'pathname' | 'search' | 'hash'> {
	const href = useHref(to);
	const url = new URL(href, 'http://exact.local');
	return { pathname: url.pathname, search: url.search, hash: url.hash };
}
/** Matches a path pattern against the current pathname. */
export function useMatch(pattern: Parameters<typeof matchPath>[0]): ReturnType<typeof matchPath> {
	return matchPath(pattern, useLocation().pathname);
}
/** Reads URL search parameters and returns a navigation-backed setter. */
export function useSearchParams(
	defaultInit?: string | URLSearchParams | Record<string, string>
): readonly [
	URLSearchParams,
	(
		next:
			| URLSearchParams
			| Record<string, string>
			| ((current: URLSearchParams) => URLSearchParams),
		options?: NavigateOptions
	) => void
] {
	const location = useLocation();
	const navigate = useNavigate();
	const params = new URLSearchParams(location.search || defaultInit);
	return [
		params,
		(next, options) => {
			const value = typeof next === 'function' ? next(params) : new URLSearchParams(next);
			void navigate(
				{ pathname: location.pathname, search: `?${value}`, hash: location.hash },
				options
			);
		}
	] as const;
}
/** Returns public data for every match in the active route branch. */
export function useMatches(): readonly Readonly<{
	id: string;
	pathname: string;
	params: Readonly<Record<string, string>>;
	data: unknown;
	handle: unknown;
}>[] {
	const snapshot = useSnapshot();
	return snapshot.matches.map((match) => ({
		id: match.id,
		pathname: match.pathname,
		params: match.params,
		data: snapshot.loaderData[match.id],
		handle: match.route.handle
	}));
}

/** Performs declarative navigation after the component commits. */
export function Navigate(props: {
	to: To;
	replace?: boolean;
	state?: unknown;
	relative?: 'route' | 'path';
}): null {
	const navigate = useNavigate();
	useEffect(() => {
		void navigate(props.to, {
			replace: props.replace,
			state: props.state,
			relative: props.relative
		});
	}, []);
	return null;
}

/** Renders an anchor that delegates same-origin navigation to the router. */
export function Link(
	props: Record<string, unknown> & {
		to: To;
		replace?: boolean;
		state?: unknown;
		reloadDocument?: boolean;
		children?: ReactNode;
		onClick?: (event: MouseEvent) => unknown;
	}
): ReactNode {
	const navigate = useNavigate();
	const href = useHref(props.to);
	const { to, replace, state, reloadDocument, onClick, ...rest } = props;
	return createElement('a', {
		...rest,
		href,
		onClick: (event: MouseEvent) => {
			onClick?.(event);
			if (reloadDocument || !shouldHandleClick(event, href)) return;
			event.preventDefault();
			void navigate(to, { replace, state });
		}
	});
}

/** Renders a Link with active, pending, and transitioning presentation state. */
export function NavLink(
	props: Parameters<typeof Link>[0] & {
		end?: boolean;
		className?:
			| string
			| ((state: {
					isActive: boolean;
					isPending: boolean;
					isTransitioning: boolean;
			  }) => string | undefined);
		style?:
			| Record<string, unknown>
			| ((state: {
					isActive: boolean;
					isPending: boolean;
					isTransitioning: boolean;
			  }) => Record<string, unknown> | undefined);
	}
): ReactNode {
	const location = useLocation();
	const navigation = useNavigation();
	const resolved = useResolvedPath(props.to);
	const isActive = props.end
		? location.pathname === resolved.pathname
		: location.pathname === resolved.pathname ||
			location.pathname.startsWith(`${resolved.pathname.replace(/\/$/, '')}/`);
	const isPending = navigation.location?.pathname === resolved.pathname;
	const state = { isActive, isPending, isTransitioning: false };
	return createElement(Link, {
		...props,
		'aria-current': isActive ? 'page' : undefined,
		className: typeof props.className === 'function' ? props.className(state) : props.className,
		style: typeof props.style === 'function' ? props.style(state) : props.style
	});
}

/** Returns the current data-router navigation state. */
export function useNavigation(): ExactRouterSnapshot<RouteObject>['navigation'] {
	return useSnapshot().navigation;
}
/** Returns loader data for the deepest active route match. */
export function useLoaderData<T = unknown>(): T {
	const id = useContext(RouteIdContext);
	return useSnapshot().loaderData[id ?? ''] as T;
}
/** Returns action data for the deepest active route match. */
export function useActionData<T = unknown>(): T | undefined {
	const id = useContext(RouteIdContext);
	return useSnapshot().actionData[id ?? ''] as T | undefined;
}
/** Returns the error associated with the nearest failed route match. */
export function useRouteError(): unknown {
	const routeError = useContext(RouteErrorContext);
	if (routeError.active) return routeError.error;
	const id = useContext(RouteIdContext);
	return useSnapshot().errors[id ?? ''];
}
/** Returns loader data for a specific active route id. */
export function useRouteLoaderData<T = unknown>(routeId: string): T | undefined {
	return useSnapshot().loaderData[routeId] as T | undefined;
}
/** Returns the current revalidation state and an explicit revalidation trigger. */
export function useRevalidator(): { revalidate(): Promise<void>; state: 'idle' | 'loading' } {
	const router = useRouter();
	const snapshot = useSnapshot(router);
	return { revalidate: () => router.revalidate(), state: snapshot.revalidation };
}

/** Registers a navigation blocker and exposes its proceed/reset state machine. */
export function useBlocker(
	shouldBlock:
		| boolean
		| ((args: {
				currentLocation: RouteLocation;
				nextLocation: RouteLocation;
				historyAction: 'POP' | 'PUSH' | 'REPLACE';
		  }) => boolean)
): {
	state: 'unblocked' | 'blocked' | 'proceeding';
	location?: RouteLocation;
	proceed?(): void;
	reset?(): void;
} {
	const router = useRouter();
	const bypass = useRef(false);
	const [blocked, setBlocked] = useState<{
		state: 'unblocked' | 'blocked' | 'proceeding';
		location?: RouteLocation;
		proceed?(): void;
		reset?(): void;
	}>({ state: 'unblocked' });
	useEffect(
		() =>
			router.block((transition) => {
				if (bypass.current) {
					bypass.current = false;
					return false;
				}
				const active = typeof shouldBlock === 'function' ? shouldBlock(transition) : shouldBlock;
				if (!active) return false;
				const reset = () => setBlocked({ state: 'unblocked' });
				const proceed = () => {
					setBlocked({ state: 'proceeding', location: transition.nextLocation });
					bypass.current = true;
					void router
						.navigate(locationToString(transition.nextLocation), {
							replace: transition.historyAction === 'REPLACE',
							state: transition.nextLocation.state
						})
						.finally(reset);
				};
				setBlocked({ state: 'blocked', location: transition.nextLocation, proceed, reset });
				return true;
			}),
		[router, shouldBlock]
	);
	return blocked;
}

/** Displays a confirmation prompt while a configured navigation blocker is active. */
export function unstable_usePrompt(options: {
	when: boolean | Parameters<typeof useBlocker>[0];
	message: string;
}): void {
	const blocker = useBlocker(options.when);
	useEffect(() => {
		if (blocker.state !== 'blocked') return;
		if (typeof window !== 'undefined' && window.confirm(options.message)) blocker.proceed?.();
		else blocker.reset?.();
	}, [blocker.state, options.message]);
}

/** Registers and cleans up a browser beforeunload listener. */
export function useBeforeUnload(
	callback: (event: BeforeUnloadEvent) => unknown,
	options?: AddEventListenerOptions
): void {
	useEffect(() => {
		if (typeof window === 'undefined') return;
		window.addEventListener('beforeunload', callback, options);
		return () => window.removeEventListener('beforeunload', callback, options);
	}, [callback, options]);
}

/** Resolves a form action relative to the active route. */
export function useFormAction(action = '.', _options?: { relative?: 'route' | 'path' }): string {
	return useHref(action);
}

/** Returns a click handler that performs accessible client-side link navigation. */
export function useLinkClickHandler<T extends Element = HTMLAnchorElement>(
	to: To,
	options: NavigateOptions & { target?: string } = {}
): (event: MouseEvent & { currentTarget: T }) => void {
	const navigate = useNavigate();
	const href = useHref(to, { relative: options.relative });
	return (event) => {
		if ((options.target && options.target !== '_self') || !shouldHandleClick(event, href)) return;
		event.preventDefault();
		void navigate(to, options);
	};
}

/** Saves and restores scroll positions as router locations change. */
export function ScrollRestoration(props: {
	getKey?: (location: RouteLocation, matches: ReturnType<typeof useMatches>) => string;
}): null {
	const router = useRouter();
	const location = useLocation();
	const matches = useMatches();
	useEffect(() => {
		if (typeof window === 'undefined') return;
		const key = props.getKey?.(location, matches) ?? location.key;
		let positions = scrollPositions.get(router);
		if (!positions) scrollPositions.set(router, (positions = new Map()));
		const saved = positions.get(key);
		if (saved) window.scrollTo(saved[0], saved[1]);
		return () => {
			positions!.set(key, [window.scrollX, window.scrollY]);
		};
	}, [location.key]);
	return null;
}
const scrollPositions = new WeakMap<
	ExactRouter<RouteObject>,
	Map<string, readonly [number, number]>
>();

/** Returns a function that submits forms or form-like data through the router. */
