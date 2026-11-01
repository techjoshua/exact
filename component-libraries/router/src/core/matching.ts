import type { ExactRouteDefinition, RouteMatch } from './contracts.js';
import { decode, segments } from './locations.js';
import { routeRecordValue, setRouteRecordValue } from './route-records.js';
import { literalSegmentMatches, planOptionalPaths } from './optional-paths.js';

/**
 * Returns the most specific complete route branch, including a parent at its own URL.
 * Equal scores retain declaration order. Empty results indicate no match. Branch ranking uses
 * one pass over cached scores, without sorting or allocating successful-candidate arrays.
 */
export function matchRoutes<Route extends ExactRouteDefinition>(
	routes: readonly Route[],
	pathname: string
): readonly RouteMatch<Route>[] {
	const candidates: Array<{ routes: Route[]; score: number }> = [];
	collectBranches(routes, [], candidates);
	const pathSegments = segments(pathname);
	let best: readonly RouteMatch<Route>[] | undefined;
	let bestScore = -Infinity;
	for (const candidate of candidates) {
		// Equal scores retain the first successful declaration, matching stable-sort precedence.
		if (candidate.score <= bestScore) continue;
		const planned = planOptionalPaths(candidate.routes, pathSegments, true);
		if (planned === undefined) continue;
		const score = planned ? scoreBranch(candidate.routes, planned) : candidate.score;
		if (score <= bestScore) continue;
		const matched = matchBranch(candidate.routes, pathSegments, true, planned);
		if (matched) {
			best = matched;
			bestScore = score;
		}
	}
	return Object.freeze(best ?? []);
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
	const pathSegments = segments(pathname);
	const branch = [route];
	const end = config.end ?? true;
	const planned = planOptionalPaths(branch, pathSegments, end);
	return planned === undefined
		? null
		: (matchBranch(branch, pathSegments, end, planned)?.[0] ?? null);
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
					const value = routeRecordValue(params, key);
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

/** Enumerates path-owning and terminal branches in declaration order, retaining their layout ancestry. */
function collectBranches<Route extends ExactRouteDefinition>(
	routes: readonly Route[],
	parents: readonly Route[],
	output: Array<{ routes: Route[]; score: number }>
): void {
	for (const route of routes) {
		const branch = [...parents, route];
		const children = route.children ?? [];
		if (!children.length || route.index || route.path !== undefined)
			output.push({ routes: branch, score: scoreBranch(branch) });
		if (children.length) collectBranches(children as readonly Route[], branch, output);
	}
}

/** Ranks authored paths, or their resolved omissions when optional planning changes specificity. */
function scoreBranch(routes: readonly ExactRouteDefinition[], planned?: readonly string[]): number {
	return routes.reduce(
		(score, route, index) =>
			score +
			(route.index ? 5 : 0) +
			segments(planned?.[index] ?? route.path ?? '').reduce(
				(value, segment) =>
					value +
					(segment === '*' ? 1 : segment.startsWith(':') ? (segment.endsWith('?') ? 15 : 20) : 30),
				0
			) +
			1,
		0
	);
}

/** Captures one prepared branch while preserving original route identity and inherited parameters. */
function matchBranch<Route extends ExactRouteDefinition>(
	routes: readonly Route[],
	pathSegments: readonly string[],
	end: boolean,
	planned: readonly string[] | null
): readonly RouteMatch<Route>[] | undefined {
	let cursor = 0;
	let params: Record<string, string> = {};
	const matches: RouteMatch<Route>[] = [];
	for (const route of routes) {
		const matched = matchRoute(
			route,
			pathSegments,
			cursor,
			params,
			end && route === routes.at(-1),
			planned?.[matches.length]
		);
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
	if (end && cursor !== pathSegments.length) return undefined;
	return Object.freeze(matches);
}

function matchRoute(
	route: ExactRouteDefinition,
	pathSegments: readonly string[],
	start: number,
	inherited: Readonly<Record<string, string>>,
	end: boolean,
	path = route.path
):
	| { cursor: number; params: Record<string, string>; pathname: string; pathnameBase: string }
	| undefined {
	let cursor = path?.startsWith('/') ? 0 : start;
	const params = { ...inherited };
	let splatStart: number | undefined;
	if (route.index && cursor !== pathSegments.length) return undefined;
	for (const segment of route.index ? [] : segments(path ?? '')) {
		if (segment === '*') {
			splatStart = cursor;
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
			setRouteRecordValue(params, name, decode(actual));
			cursor++;
			continue;
		}
		if (actual === undefined) return undefined;
		if (!literalSegmentMatches(actual, segment, route.caseSensitive)) return undefined;
		cursor++;
	}
	if (end && cursor !== pathSegments.length) return undefined;
	const pathname = `/${pathSegments.slice(0, cursor).join('/')}` || '/';
	const pathnameBase =
		splatStart === undefined ? pathname : `/${pathSegments.slice(0, splatStart).join('/')}`;
	return { cursor, params, pathname, pathnameBase: pathnameBase || '/' };
}
