import type { ExactRouteDefinition, RouteMatch } from './contracts.js';
import { decode, segments } from './locations.js';

/** Performs the match routes domain operation. */
export function matchRoutes<Route extends ExactRouteDefinition>(
	routes: readonly Route[],
	pathname: string
): readonly RouteMatch<Route>[] {
	const candidates: Array<{ routes: Route[]; score: number }> = [];
	collectBranches(routes, [], candidates);
	const matches = candidates
		.map((candidate) => ({ ...candidate, matched: matchBranch(candidate.routes, pathname) }))
		.filter(
			(candidate): candidate is typeof candidate & { matched: readonly RouteMatch<Route>[] } =>
				!!candidate.matched
		)
		.sort((left, right) => scoreBranch(right.routes) - scoreBranch(left.routes))[0];
	return Object.freeze(matches?.matched ?? []);
}

/** Matches a single path pattern and returns decoded parameters. */
export function matchPath(
	pattern: string | Readonly<{ path: string; caseSensitive?: boolean; end?: boolean }>,
	pathname: string
): RouteMatch | null {
	const config = typeof pattern === 'string' ? { path: pattern, end: true } : pattern;
	const route: ExactRouteDefinition = {
		id: '__match_path__',
		path: config.path,
		caseSensitive: config.caseSensitive
	};
	const matched = matchRoute(route, segments(pathname), 0, {}, config.end ?? true);
	if (!matched) return null;
	return {
		id: route.id ?? '__match_path__',
		route,
		path: route.path,
		pathname: matched.pathname,
		pathnameBase: matched.pathnameBase,
		params: matched.params
	};
}

/** Interpolates named and splat parameters into a route path template. */
export function generatePath(
	path: string,
	params: Readonly<Record<string, string | null | undefined>> = {}
): string {
	return (
		path
			.replace(
				/:([A-Za-z0-9_]+)(\?)?|\*/g,
				(token, name: string | undefined, optional: string | undefined) => {
					const key = name ?? '*';
					const value = params[key];
					if (value == null) {
						if (optional) return '';
						throw new Error(`Missing route parameter ${key}`);
					}
					return String(value)
						.split('/')
						.map(encodeURIComponent)
						.join(name ? '%2F' : '/');
				}
			)
			.replace(/\/{2,}/g, '/')
			.replace(/\/$/, '') || '/'
	);
}

function collectBranches<Route extends ExactRouteDefinition>(
	routes: readonly Route[],
	parents: readonly Route[],
	output: Array<{ routes: Route[]; score: number }>
): void {
	for (const route of routes) {
		const branch = [...parents, route];
		const children = route.children ?? [];
		if (!children.length || route.index || route.path === '*')
			output.push({ routes: branch, score: scoreBranch(branch) });
		if (children.length) collectBranches(children as readonly Route[], branch, output);
	}
}

function scoreBranch(routes: readonly ExactRouteDefinition[]): number {
	return routes.reduce(
		(score, route) =>
			score +
			(route.index ? 5 : 0) +
			segments(route.path ?? '').reduce(
				(value, segment) =>
					value +
					(segment === '*' ? 1 : segment.startsWith(':') ? (segment.endsWith('?') ? 15 : 20) : 30),
				0
			) +
			1,
		0
	);
}

function matchBranch<Route extends ExactRouteDefinition>(
	routes: readonly Route[],
	pathname: string
): readonly RouteMatch<Route>[] | undefined {
	const pathSegments = segments(pathname);
	let cursor = 0;
	let params: Record<string, string> = {};
	const matches: RouteMatch<Route>[] = [];
	for (const route of routes) {
		const matched = matchRoute(route, pathSegments, cursor, params, route === routes.at(-1));
		if (!matched) return undefined;
		cursor = matched.cursor;
		params = matched.params;
		matches.push({
			id: route.id ?? `route-${matches.length}`,
			route,
			path: route.path,
			pathname: matched.pathname,
			pathnameBase: matched.pathnameBase,
			params: Object.freeze({ ...params })
		});
	}
	if (cursor !== pathSegments.length) return undefined;
	return Object.freeze(matches);
}

function matchRoute(
	route: ExactRouteDefinition,
	pathSegments: readonly string[],
	start: number,
	inherited: Readonly<Record<string, string>>,
	end: boolean
):
	| { cursor: number; params: Record<string, string>; pathname: string; pathnameBase: string }
	| undefined {
	let cursor = route.path?.startsWith('/') ? 0 : start;
	const params = { ...inherited };
	if (route.index && cursor !== pathSegments.length) return undefined;
	for (const segment of route.index ? [] : segments(route.path ?? '')) {
		if (segment === '*') {
			params['*'] = decode(pathSegments.slice(cursor).join('/'));
			cursor = pathSegments.length;
			break;
		}
		const actual = pathSegments[cursor];
		if (segment.startsWith(':')) {
			const optional = segment.endsWith('?');
			const name = segment.slice(1, optional ? -1 : undefined);
			if (actual === undefined) {
				if (optional) continue;
				return undefined;
			}
			params[name] = decode(actual);
			cursor++;
			continue;
		}
		if (actual === undefined) return undefined;
		const equal = route.caseSensitive
			? actual === segment
			: actual.toLowerCase() === segment.toLowerCase();
		if (!equal) return undefined;
		cursor++;
	}
	if (end && cursor !== pathSegments.length) return undefined;
	const pathname = `/${pathSegments.slice(0, cursor).join('/')}` || '/';
	const splat = route.path?.includes('*');
	const pathnameBase = splat
		? `/${pathSegments.slice(0, Math.max(start, cursor - segments(params['*'] ?? '').length)).join('/')}`
		: pathname;
	return { cursor, params, pathname, pathnameBase: pathnameBase || '/' };
}

/** Normalizes a location source into the router's public location value. */
