import type { LocationSource, RouteLocation, RouterMode } from './contracts.js';

/** Performs the location value domain operation. */
export function locationValue(
	source: LocationSource,
	mode: RouterMode,
	basename: string
): RouteLocation {
	const url = routeUrl(source.location(), mode);
	const pathname = stripBasename(normalizePath(url.pathname), basename);
	return Object.freeze({
		pathname,
		search: url.search,
		hash: url.hash,
		state: source.state?.(),
		key: source.key?.() ?? 'default'
	});
}

/** Formats a destination URL as a browser- or hash-router href. */
export function hrefFor(
	to: string | URL,
	current: URL,
	basename: string,
	mode: RouterMode
): string {
	if (to instanceof URL || (typeof to === 'string' && /^[a-z][a-z\d+.-]*:/i.test(to)))
		return String(to);
	const url = resolveTarget(to, current, basename, mode);
	const path = `${url.pathname}${url.search}${url.hash}`;
	return mode === 'hash' ? `#${path}` : path;
}

/** Resolves a destination against the current route and basename. */
export function resolveTarget(
	to: string | URL,
	current: URL,
	basename: string,
	mode: RouterMode
): URL {
	if (to instanceof URL) return to;
	if (/^[a-z][a-z\d+.-]*:/i.test(to)) return new URL(to);
	const routeCurrent = routeUrl(current, mode);
	if (to.startsWith('/')) return new URL(`${basename}${to}` || '/', routeCurrent.origin);
	return new URL(to, routeCurrent);
}

/** Converts a browser URL into the route URL observed by the selected router mode. */
export function routeUrl(url: URL, mode: RouterMode): URL {
	return mode === 'hash' && url.hash.startsWith('#/')
		? new URL(url.hash.slice(1), url.origin)
		: url;
}
/** Coerces a string or URL into an absolute URL suitable for matching. */
export function toUrl(value: string | URL): URL {
	return value instanceof URL ? value : new URL(value, 'http://exact.local');
}
/** Normalizes a basename to a leading-slash path without a trailing slash. */
export function normalizeBasename(value?: string): string {
	const normalized = normalizePath(value ?? '/');
	return normalized === '/' ? '' : normalized.replace(/\/$/, '');
}
/** Normalizes a pathname to a leading-slash path without redundant trailing slashes. */
export function normalizePath(value: string): string {
	const normalized = `/${value}`.replace(/\/{2,}/g, '/');
	return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
}
/** Removes a matching router basename while preserving the root path. */
export function stripBasename(pathname: string, basename: string): string {
	if (!basename) return pathname;
	const path = pathname.toLowerCase();
	const base = basename.toLowerCase();
	return path === base || path.startsWith(`${base}/`)
		? normalizePath(pathname.slice(basename.length))
		: pathname;
}
/** Performs the segments domain operation. */
export function segments(path: string): string[] {
	return normalizePath(path).split('/').filter(Boolean);
}
/** Reads a decode from its source representation. */
export function decode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
let keySequence = 0;
/** Allocates a compact process-local history entry key. */
export function createKey(): string {
	return (++keySequence).toString(36);
}
