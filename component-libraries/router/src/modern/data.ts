import {
	createElement,
	useContext,
	useEffect,
	useId,
	useMemo,
	type ReactComponentType,
	type ReactNode
} from '@exactjs/react-compat';
import {
	createExactRouter,
	createMemoryLocationSource,
	hydrationEnvelopeFromSnapshot,
	stripBasename,
	type ExactRouter
} from '../core.js';
import { formDataSearchParams, hydrationElementId } from './browser.js';
import {
	RouteIdContext,
	useRouter,
	useSnapshot,
	type RouteObject,
	type StaticHandlerContext
} from './context.js';
import { useFormAction } from './hooks.js';
import { createPath, locationToString, parsePath, resolveRouteRelativeTo } from './paths.js';
import { resolveFormAction } from './form-actions.js';
import { RouterProvider } from './routers.js';

export { createPath, createSearchParams, parsePath, resolvePath } from './paths.js';
export { createStaticHandler } from './static-handler.js';
/** Resolves from the owning route at invocation time, replacing GET query data or invoking its target action. */
export function useSubmit(): (
	target: HTMLFormElement | FormData | URLSearchParams | Record<string, string>,
	options?: {
		action?: string;
		method?: string;
		encType?: string;
		replace?: boolean;
		relative?: 'route' | 'path';
	}
) => Promise<void> {
	const router = useRouter();
	const routeId = useContext(RouteIdContext);
	return async (target, options = {}) => {
		const { action, init } = formSubmission(target, options, router, routeId);
		if (init.method === 'GET') await router.navigate(action, { replace: options.replace });
		else await router.submit(action, init);
	};
}

/** Renders a form whose submissions participate in data-router navigation. */
export function Form(
	props: Record<string, unknown> & {
		action?: string;
		method?: string;
		encType?: string;
		replace?: boolean;
		relative?: 'route' | 'path';
		reloadDocument?: boolean;
		onSubmit?: (event: SubmitEvent) => unknown;
		children?: ReactNode;
	}
): ReactNode {
	return renderSubmissionForm(props, useSubmit());
}

/** Shares native form interception while retaining each interaction's submission owner. */
function renderSubmissionForm(
	props: Parameters<typeof Form>[0],
	submit: ReturnType<typeof useSubmit>
): ReactNode {
	const { replace, relative, reloadDocument, onSubmit, ...rest } = props;
	const action = useFormAction(props.action, { relative });
	return createElement('form', {
		...rest,
		action,
		onSubmit: (event: SubmitEvent) => {
			onSubmit?.(event);
			if (reloadDocument || event.defaultPrevented) return;
			event.preventDefault();
			return submit(event.currentTarget as HTMLFormElement, {
				action: props.action,
				method: props.method,
				encType: props.encType,
				replace,
				relative
			});
		}
	});
}

/**
 * Prepares GET fields or a mutation body from the current owning route. Form attributes already
 * include the basename. Only fetcher GETs retain naked index selection while replacing query fields.
 * Input FormData and URLSearchParams values are never mutated.
 */
function formSubmission(
	target: Parameters<ReturnType<typeof useSubmit>>[0],
	options: NonNullable<Parameters<ReturnType<typeof useSubmit>>[1]>,
	router: ExactRouter<RouteObject>,
	routeId: string | undefined,
	preserveIndex = false
): { action: string; init: RequestInit } {
	const form = target instanceof HTMLFormElement ? target : undefined;
	const body = form
		? new FormData(form)
		: target instanceof FormData || target instanceof URLSearchParams
			? target
			: new URLSearchParams(target as Record<string, string>);
	const method = (options.method ?? form?.method ?? 'get').toUpperCase();
	let authored = options.action;
	if (authored === undefined && form) {
		authored = form.getAttribute('action') || undefined;
		if (authored?.startsWith('/') && !authored.startsWith('//')) {
			const path = parsePath(authored);
			authored = createPath({
				...path,
				pathname: stripBasename(path.pathname ?? '/', router.basename)
			});
		}
	}
	const action = resolveFormAction(authored, router.getSnapshot(), routeId, options.relative);
	if (method !== 'GET')
		return {
			action,
			init: mutationRequest(
				method,
				body,
				options.encType ?? form?.enctype ?? 'application/x-www-form-urlencoded'
			)
		};
	const search = body instanceof FormData ? formDataSearchParams(body) : body;
	const fragment = action.indexOf('#');
	const path = fragment < 0 ? action : action.slice(0, fragment);
	const hash = fragment < 0 ? '' : action.slice(fragment);
	const query = search.toString();
	const index =
		preserveIndex &&
		new URLSearchParams(parsePath(action).search).getAll('index').includes('') &&
		!search.getAll('index').includes('');
	return {
		action: `${path.split('?', 1)[0]}?${query}${index ? (query ? '&index' : 'index') : ''}${hash}`,
		init: { method }
	};
}

/** Encodes mutation fields using the requested MIME type, leaving multipart boundary selection to Request. */
function mutationRequest(
	method: string,
	body: FormData | URLSearchParams,
	encoding: string
): RequestInit {
	if (encoding === 'multipart/form-data') {
		if (body instanceof FormData) return { method, body };
		const fields = new FormData();
		body.forEach((value, name) => fields.append(name, value));
		return { method, body: fields };
	}
	const fields = body instanceof FormData ? formDataSearchParams(body) : body;
	if (encoding === 'application/x-www-form-urlencoded') return { method, body: fields };
	if (encoding === 'application/json')
		return {
			method,
			body: JSON.stringify(Object.fromEntries(fields)),
			headers: { 'Content-Type': 'application/json' }
		};
	if (encoding === 'text/plain')
		return { method, body: Array.from(fields, ([name, value]) => `${name}=${value}\r\n`).join('') };
	throw new TypeError(`Unsupported form encoding ${encoding}`);
}

/**
 * Loads or submits data independently of page navigation. Its Form retains input identity across
 * fetcher updates. Unmounting releases owned work, and an explicit handler redirect may navigate.
 */
export function useFetcher<T = unknown>(): {
	state: 'idle' | 'loading' | 'submitting';
	data?: T;
	error?: unknown;
	load(href: string): Promise<void>;
	submit(
		target: FormData | URLSearchParams | Record<string, string>,
		options?: { action?: string; method?: string; encType?: string; relative?: 'route' | 'path' }
	): Promise<void>;
	Form: ReactComponentType<Parameters<typeof Form>[0]>;
} {
	const router = useRouter();
	const snapshot = useSnapshot(router);
	const routeId = useContext(RouteIdContext);
	const key = `fetcher-${useId()}`;
	useEffect(() => () => router.releaseFetcher(key), [router, key]);
	const interaction = useMemo(() => {
		const fetch = (href: string, init?: RequestInit) =>
			router.fetch(
				key,
				undefined,
				resolveRouteRelativeTo(href, router.getSnapshot(), routeId, undefined),
				init
			);
		const submit: ReturnType<typeof useSubmit> = async (target, options = {}) => {
			const { action, init } = formSubmission(target, options, router, routeId, true);
			await fetch(action, init);
		};
		return {
			load: fetch,
			submit,
			Form: (props: Parameters<typeof Form>[0]) => renderSubmissionForm(props, submit)
		};
	}, [router, key, routeId]);
	const state = snapshot.fetchers.get(key) ?? { state: 'idle' as const };
	if (!routeId) throw new Error('useFetcher must be used within a matched route');
	return {
		...state,
		data: state.data as T | undefined,
		load: interaction.load,
		submit: (target, options = {}) =>
			interaction.submit(target, { ...options, method: options.method ?? 'POST' }),
		Form: interaction.Form
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
