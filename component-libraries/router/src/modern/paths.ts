import type { RouteLocation } from '../core.js';
import { isAbsoluteDestination } from '../core/url-destinations.js';

/** A navigation destination represented as a URL string or location fields. */
export type To = string | Partial<Pick<RouteLocation, 'pathname' | 'search' | 'hash'>>;

type RouteRelativeSnapshot = Readonly<{
	location: Readonly<{ pathname: string }>;
	matches: readonly Readonly<{
		id: string;
		pathname: string;
		pathnameBase: string;
		route: Readonly<{ path?: string }>;
	}>[];
}>;

/** Creates URL search parameters while preserving repeated record values. */
export function createSearchParams(
	init:
		| string
		| URLSearchParams
		| readonly (readonly [string, string])[]
		| Record<string, string | readonly string[]> = ''
): URLSearchParams {
	if (typeof init === 'string' || init instanceof URLSearchParams || Array.isArray(init)) {
		return new URLSearchParams(init as string | URLSearchParams | string[][]);
	}
	const params = new URLSearchParams();
	for (const [name, value] of Object.entries(init)) {
		if (Array.isArray(value)) value.forEach((item) => params.append(name, item));
		else params.set(name, value as string);
	}
	return params;
}

/** Serializes normalized pathname, search, and hash fields into a URL path. */
export function createPath(
	value: Partial<Pick<RouteLocation, 'pathname' | 'search' | 'hash'>>
): string {
	const pathname = value.pathname || '/';
	const search = pathSuffix(value.search, '?');
	const hash = pathSuffix(value.hash, '#');
	return `${pathname}${search}${hash}`;
}

/** Parses a URL path without supplying fields that were absent from the input. */
export function parsePath(
	value: string
): Partial<Pick<RouteLocation, 'pathname' | 'search' | 'hash'>> {
	const parsed: Partial<Pick<RouteLocation, 'pathname' | 'search' | 'hash'>> = {};
	const hashIndex = value.indexOf('#');
	if (hashIndex >= 0) {
		parsed.hash = value.slice(hashIndex);
		value = value.slice(0, hashIndex);
	}
	const searchIndex = value.indexOf('?');
	if (searchIndex >= 0) {
		parsed.search = value.slice(searchIndex);
		value = value.slice(0, searchIndex);
	}
	if (value) parsed.pathname = value;
	return parsed;
}

/** Resolves a navigation destination against a pathname. */
export function resolvePath(
	to: To,
	fromPathname = '/'
): Pick<RouteLocation, 'pathname' | 'search' | 'hash'> {
	const value = typeof to === 'string' ? parsePath(to) : to;
	let pathname = fromPathname;
	if (value.pathname) {
		const parts = value.pathname.startsWith('/')
			? ['']
			: fromPathname.replace(/\/+$/, '').split('/');
		for (const segment of value.pathname.replace(/\/{2,}/g, '/').split('/')) {
			if (segment === '..') {
				if (parts.length > 1) parts.pop();
			} else if (segment !== '.' && !(segment === '' && parts.length === 1)) parts.push(segment);
		}
		pathname = parts.join('/') || '/';
	}
	return { pathname, search: pathSuffix(value.search, '?'), hash: pathSuffix(value.hash, '#') };
}

/** Serializes a partial location, using `/` for an entirely empty location. */
export function locationToString(
	location: Partial<Pick<RouteLocation, 'pathname' | 'search' | 'hash'>>
): string {
	return `${location.pathname ?? ''}${location.search ?? ''}${location.hash ?? ''}` || '/';
}

/** Converts an object destination into the string accepted by router sources. */
export function toNavigationValue(to: To): string {
	return typeof to === 'string' ? to : locationToString(to);
}

/**
 * Resolves destinations against the owning route. Route-relative parents skip pathless and index
 * matches, while path-relative parents remove URL segments. Query-only and fragment-only
 * destinations retain the current pathname. Object destinations are never mutated.
 */
export function resolveRouteRelativeTo(
	to: To,
	snapshot: RouteRelativeSnapshot,
	routeId: string | undefined,
	relative: 'route' | 'path' | undefined
): string {
	if (typeof to === 'string' && isAbsoluteDestination(to)) return to;
	const value = typeof to === 'string' ? parsePath(to) : { ...to };
	const empty = to === '' || value.pathname === '';
	let base = snapshot.location.pathname;
	if (value.pathname !== undefined || empty) {
		let index =
			routeId === undefined
				? snapshot.matches.length - 1
				: snapshot.matches.findIndex((match) => match.id === routeId);
		while (index > 0 && !snapshot.matches[index]!.route.path) index--;
		const owner = index;
		const segments = (value.pathname ?? '').split('/');
		let parents = 0;
		if (relative !== 'path')
			while (segments[parents] === '..') {
				do {
					index--;
				} while (index > 0 && !snapshot.matches[index]!.route.path);
				parents++;
			}
		value.pathname = segments.slice(parents).join('/');
		const match = snapshot.matches[index];
		base = match ? (index === owner ? match.pathname : match.pathnameBase) : '/';
	}
	const resolved = resolvePath(value, base);
	if (
		!resolved.pathname.endsWith('/') &&
		((value.pathname?.endsWith('/') && value.pathname !== '/') ||
			((empty || value.pathname === '.') && snapshot.location.pathname.endsWith('/')))
	)
		resolved.pathname += '/';
	return createPath(resolved);
}

/** Normalizes one optional URL suffix without changing its contents. */
function pathSuffix(value: string | undefined, prefix: '?' | '#'): string {
	return !value || value === prefix ? '' : value.startsWith(prefix) ? value : prefix + value;
}
