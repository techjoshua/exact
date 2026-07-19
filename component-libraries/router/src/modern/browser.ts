import {
	matchRoutes as exactMatchRoutes,
	locationValue,
	normalizeBasename,
	type ExactHydrationData,
	type ExactHydrationEnvelope,
	type LocationSource,
	type RouterMode
} from '../core.js';
import type { RouteObject } from './context.js';
import { locationToString } from './paths.js';

export { createPath, createSearchParams, parsePath, resolvePath } from './paths.js';

/** Reports whether promise like. */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> & object {
	return (
		((typeof value === 'object' && value !== null) || typeof value === 'function') &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}

/** Reports whether handle click. */
export function shouldHandleClick(event: MouseEvent, href?: string): boolean {
	const anchor = (event.currentTarget ?? event.target) as HTMLAnchorElement | null;
	return (
		!event.defaultPrevented &&
		event.button === 0 &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.shiftKey &&
		!event.altKey &&
		(!anchor?.target || anchor.target === '_self') &&
		!anchor?.hasAttribute('download') &&
		!isExternalHref(href ?? anchor?.href)
	);
}
/** Reports whether external href. */
export function isExternalHref(href: string | undefined): boolean {
	if (!href || typeof window === 'undefined') return false;
	try {
		const url = new URL(href, window.location.href);
		return !/^https?:$/.test(url.protocol) || url.origin !== window.location.origin;
	} catch {
		return true;
	}
}
/** Performs the form data search params domain operation. */
export function formDataSearchParams(formData: FormData): URLSearchParams {
	const params = new URLSearchParams();
	formData.forEach((value, name) => params.append(name, String(value)));
	return params;
}
/** Creates a static location source. */
export function createStaticLocationSource(initial: string | URL): {
	source: LocationSource;
	redirect(): { location: URL; status: number } | undefined;
} {
	let location = new URL(initial);
	let redirected: { location: URL; status: number } | undefined;
	const listeners = new Set<(action?: 'POP' | 'PUSH' | 'REPLACE') => void>();
	const update = (next: URL, status: number | undefined, action: 'PUSH' | 'REPLACE') => {
		location = next;
		redirected = { location: next, status: status ?? 302 };
		listeners.forEach((listener) => listener(action));
	};
	return {
		source: {
			location: () => location,
			push: (url, _state, status) => update(url, status, 'PUSH'),
			replace: (url, _state, status) => update(url, status, 'REPLACE'),
			subscribe(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			}
		},
		redirect: () => redirected
	};
}
/** Performs the request init domain operation. */
export async function requestInit(request: Request): Promise<RequestInit> {
	const body = await request.clone().arrayBuffer();
	return {
		method: request.method,
		headers: request.headers,
		...(body.byteLength ? { body } : {})
	};
}
/** Performs the browser window source domain operation. */
export function browserWindowSource(target: Window, mode: RouterMode): LocationSource {
	const read = () =>
		mode === 'hash'
			? new URL(target.location.hash.slice(1) || '/', target.location.origin)
			: new URL(target.location.href);
	return {
		location: read,
		state: () => target.history.state?.usr,
		key: () => String(target.history.state?.key ?? 'default'),
		push(url, state) {
			target.history.pushState(
				{ usr: state },
				'',
				mode === 'hash' ? `#${url.pathname}${url.search}${url.hash}` : url
			);
		},
		replace(url, state) {
			target.history.replaceState(
				{ usr: state },
				'',
				mode === 'hash' ? `#${url.pathname}${url.search}${url.hash}` : url
			);
		},
		go: (delta) => target.history.go(delta),
		subscribe(listener) {
			const event = mode === 'hash' ? 'hashchange' : 'popstate';
			const handle = () => listener('POP');
			target.addEventListener(event, handle);
			return () => target.removeEventListener(event, handle);
		}
	};
}
/** Reads a router hydration data from its source representation. */
export function readRouterHydrationData(
	source: LocationSource,
	routes: readonly RouteObject[],
	basename: string | undefined,
	mode: RouterMode,
	hydrationKey = 'default'
): ExactHydrationData | undefined {
	if (typeof document === 'undefined') return undefined;
	const element = document.getElementById(hydrationElementId(hydrationKey));
	if (!element?.textContent) return undefined;
	element.remove();
	let envelope: ExactHydrationEnvelope;
	try {
		envelope = JSON.parse(element.textContent) as ExactHydrationEnvelope;
	} catch {
		return undefined;
	}
	if (envelope?.protocol !== 1 || envelope.key !== hydrationKey || !envelope.data) return undefined;
	const location = locationValue(source, mode, normalizeBasename(basename));
	const matches = exactMatchRoutes(routes, location.pathname).map((match) => match.id);
	if (
		envelope.location !== locationToString(location) ||
		envelope.matches.length !== matches.length ||
		envelope.matches.some((id, index) => id !== matches[index])
	)
		return undefined;
	return envelope.data;
}
/** Performs the hydration element id domain operation. */
export function hydrationElementId(key: string): string {
	return key === 'default'
		? '__exact_router_hydration'
		: `__exact_router_hydration_${encodeURIComponent(key)}`;
}
