import type { ExactRouteDefinition, RouteMatch } from './contracts.js';

/** Selects a matched explicit route, otherwise the URL's data route or leaf index for a naked index query. */
export function selectDataRoute<Route extends ExactRouteDefinition>(
	matches: readonly RouteMatch<Route>[],
	url: URL,
	routeId?: string
): RouteMatch<Route> | undefined {
	if (routeId !== undefined) return matches.find((match) => match.id === routeId);
	const leaf = matches.at(-1);
	if (leaf?.route.index && url.searchParams.getAll('index').includes('')) return leaf;
	let index = matches.length - 1;
	while (index > 0 && !matches[index]!.route.path) index--;
	return matches[index];
}

/**
 * Selects a matched data route before any fetcher state is allocated. Explicit IDs must match.
 * URL selection skips pathless and index matches unless a naked index query requests the leaf index.
 * Does not mutate matches. Unmatched destinations throw before handler execution.
 */
export function selectFetcherRoute<Route extends ExactRouteDefinition>(
	matches: readonly RouteMatch<Route>[],
	routeId: string | undefined,
	url: URL
): RouteMatch<Route> {
	const match = selectDataRoute(matches, url, routeId);
	if (!match)
		throw new Error(
			routeId === undefined
				? `No fetcher route matches ${url.pathname}`
				: `Fetcher route ${routeId} does not match ${url.pathname}`
		);
	return match;
}
