import {
	createElement,
	useContext,
	useId,
	useState,
	type ReactComponentType,
	type ReactNode
} from '@exactjs/react-compat';
import {
	createExactRouter,
	createMemoryLocationSource,
	hydrationEnvelopeFromSnapshot,
	type ExactRouter
} from '../core.js';
import {
	createStaticLocationSource,
	formDataSearchParams,
	hydrationElementId,
	requestInit
} from './browser.js';
import {
	RouteIdContext,
	useRouter,
	useSnapshot,
	type RouteObject,
	type StaticHandlerContext
} from './context.js';
import { useLocation } from './hooks.js';
import { locationToString } from './paths.js';
import { RouterProvider } from './routers.js';

export { createPath, createSearchParams, parsePath, resolvePath } from './paths.js';
/** Performs the use submit domain operation. */
export function useSubmit(): (
	target: HTMLFormElement | FormData | URLSearchParams | Record<string, string>,
	options?: { action?: string; method?: string; encType?: string; replace?: boolean }
) => Promise<void> {
	const router = useRouter();
	const location = useLocation();
	return async (target, options = {}) => {
		const formData =
			target instanceof HTMLFormElement
				? new FormData(target)
				: target instanceof FormData
					? target
					: target instanceof URLSearchParams
						? target
						: new URLSearchParams(target);
		const method = (
			options.method ?? (target instanceof HTMLFormElement ? target.method : 'get')
		).toUpperCase();
		const action =
			options.action ?? (target instanceof HTMLFormElement ? target.action : location.pathname);
		if (method === 'GET') {
			const search = formData instanceof FormData ? formDataSearchParams(formData) : formData;
			await router.navigate(`${action}?${search}`, { replace: options.replace });
		} else {
			await router.submit(action, { method, body: formData });
		}
	};
}

/** Renders a form whose submissions participate in data-router navigation. */
export function Form(
	props: Record<string, unknown> & {
		action?: string;
		method?: string;
		encType?: string;
		replace?: boolean;
		reloadDocument?: boolean;
		onSubmit?: (event: SubmitEvent) => unknown;
		children?: ReactNode;
	}
): ReactNode {
	const submit = useSubmit();
	const { replace, reloadDocument, onSubmit, ...rest } = props;
	return createElement('form', {
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

/** Creates an independent loader/action interaction that does not navigate. */
export function useFetcher<T = unknown>(): {
	state: 'idle' | 'loading' | 'submitting';
	data?: T;
	error?: unknown;
	load(href: string): Promise<void>;
	submit(
		target: FormData | URLSearchParams | Record<string, string>,
		options?: { action?: string; method?: string }
	): Promise<void>;
	Form: ReactComponentType<Parameters<typeof Form>[0]>;
} {
	const router = useRouter();
	const snapshot = useSnapshot(router);
	const routeId = useContext(RouteIdContext);
	const generated = useId();
	const [key] = useState(() => `fetcher-${generated}`);
	const state = snapshot.fetchers.get(key) ?? { state: 'idle' as const };
	if (!routeId) throw new Error('useFetcher must be used within a matched route');
	return {
		...state,
		data: state.data as T | undefined,
		load: (href) => router.fetch(key, routeId, href),
		submit: async (target, options = {}) => {
			const body =
				target instanceof FormData || target instanceof URLSearchParams
					? target
					: new URLSearchParams(target);
			await router.fetch(key, routeId, options.action ?? snapshot.location.pathname, {
				method: options.method ?? 'POST',
				body
			});
		},
		Form: (props) => createElement(Form, props)
	};
}

/** Returns snapshots for all active fetcher interactions. */
export function useFetchers(): readonly Readonly<{
	key: string;
	state: string;
	data?: unknown;
	error?: unknown;
}>[] {
	return [...useSnapshot().fetchers].map(([key, fetcher]) => ({ key, ...fetcher }));
}

/** Creates a request handler that resolves data-router state for server rendering. */
export function createStaticHandler(
	routes: readonly RouteObject[],
	options: { basename?: string } = {}
): {
	dataRoutes: readonly RouteObject[];
	query(
		request: Request,
		init?: { requestContext?: unknown }
	): Promise<Response | StaticHandlerContext>;
	queryRoute(
		request: Request,
		options?: { routeId?: string; requestContext?: unknown }
	): Promise<unknown>;
} {
	return {
		dataRoutes: routes,
		async query(request, init = {}) {
			const statics = createStaticLocationSource(request.url);
			const router = createExactRouter({
				source: statics.source,
				routes,
				basename: options.basename,
				context: init.requestContext
			});
			if (!/^(?:GET|HEAD)$/i.test(request.method)) {
				await router.submit(request.url, await requestInit(request));
			} else {
				await router.initialize();
			}
			const redirected = statics.redirect();
			if (redirected) {
				router.dispose();
				return new Response(null, {
					status: redirected.status,
					headers: { Location: redirected.location.href }
				});
			}
			const snapshot = router.getSnapshot();
			const context: StaticHandlerContext = {
				location: snapshot.location,
				matches: snapshot.matches,
				loaderData: snapshot.loaderData,
				actionData: snapshot.actionData,
				errors: snapshot.errors,
				statusCode: snapshot.statusCode,
				loaderHeaders: snapshot.loaderHeaders,
				actionHeaders: snapshot.actionHeaders
			};
			router.dispose();
			return context;
		},
		async queryRoute(request, queryOptions = {}) {
			const statics = createStaticLocationSource(request.url);
			const router = createExactRouter({
				source: statics.source,
				routes,
				basename: options.basename,
				context: queryOptions.requestContext
			});
			if (/^(?:GET|HEAD)$/i.test(request.method)) await router.initialize();
			else await router.submit(request.url, await requestInit(request));
			const redirected = statics.redirect();
			if (redirected) {
				router.dispose();
				return new Response(null, {
					status: redirected.status,
					headers: { Location: redirected.location.href }
				});
			}
			const snapshot = router.getSnapshot();
			const routeId = queryOptions.routeId ?? snapshot.matches.at(-1)?.id ?? '';
			const value = /^(?:GET|HEAD)$/i.test(request.method)
				? snapshot.loaderData[routeId]
				: snapshot.actionData[routeId];
			router.dispose();
			return value;
		}
	};
}

/** Creates a non-navigating router from a previously queried static context. */
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

/** Renders a static data router and optionally emits hydration data. */
export function StaticRouterProvider(props: {
	router: ExactRouter<RouteObject>;
	context: StaticHandlerContext;
	hydrate?: boolean;
	hydrationKey?: string;
	nonce?: string;
}): ReactNode {
	const provider = createElement(RouterProvider, { router: props.router });
	if (props.hydrate === false) return provider;
	const hydrationKey = props.hydrationKey ?? 'default';
	const hydration = hydrationEnvelopeFromSnapshot(props.router.getSnapshot(), hydrationKey);
	const source = JSON.stringify(hydration)
		.replace(/</g, '\\u003C')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
	return [
		provider,
		createElement('script', {
			id: hydrationElementId(hydrationKey),
			type: 'application/json',
			nonce: props.nonce,
			dangerouslySetInnerHTML: { __html: source }
		})
	];
}
