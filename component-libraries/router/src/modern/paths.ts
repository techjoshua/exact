import type { RouteLocation } from '../core.js';

/** A navigation destination represented as a URL string or location fields. */
export type To = string | Partial<Pick<RouteLocation, 'pathname' | 'search' | 'hash'>>;

type RouteRelativeSnapshot = Readonly<{
	matches: readonly Readonly<{ id: string; pathnameBase: string }>[];
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
	const search =
		value.search && value.search !== '?'
			? value.search.startsWith('?')
				? value.search
				: `?${value.search}`
			: '';
	const hash =
		value.hash && value.hash !== '#'
			? value.hash.startsWith('#')
				? value.hash
				: `#${value.hash}`
			: '';
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
	const pathname = value.pathname
		? value.pathname.startsWith('/')
			? value.pathname
			: new URL(
					value.pathname,
					`http://exact.local${fromPathname.endsWith('/') ? fromPathname : `${fromPathname}/`}`
				).pathname
		: fromPathname;
	return { pathname, search: value.search ?? '', hash: value.hash ?? '' };
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
 * Resolves route-relative `.` and `..` segments against matched route bases.
 */
export function resolveRouteRelativeTo(
	to: To,
	snapshot: RouteRelativeSnapshot,
	routeId: string | undefined,
	relative: 'route' | 'path' | undefined
): string {
	const value = toNavigationValue(to);
	if (
		relative === 'path' ||
		value.startsWith('/') ||
		/^[a-z][a-z\d+.-]*:/i.test(value) ||
		!routeId
	) {
		return value;
	}

	const parts = value.split('/');
	let parents = 0;
	while (parts[0] === '..') {
		parents++;
		parts.shift();
	}
	if (!parents && parts[0] !== '.') return value;
	if (parts[0] === '.') parts.shift();

	const currentIndex = snapshot.matches.findIndex((match) => match.id === routeId);
	const targetIndex = Math.max(0, currentIndex - parents);
	const base = snapshot.matches[targetIndex]?.pathnameBase ?? '/';
	if (!parts.length) return base || '/';
	return `${base.replace(/\/$/, '')}/${parts.join('/')}`.replace(/\/{2,}/g, '/') || '/';
}
