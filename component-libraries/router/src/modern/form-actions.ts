import type { ExactRouterSnapshot } from '../core/contracts.js';
import { isAbsoluteDestination } from '../core/url-destinations.js';
import { createPath, parsePath, resolveRouteRelativeTo } from './paths.js';

/** Resolves form paths with default query and index selection, applying a basename without href encoding. */
export function resolveFormAction(
	action: string | undefined,
	snapshot: ExactRouterSnapshot,
	routeId: string | undefined,
	relative: 'route' | 'path' | undefined,
	basename = ''
): string {
	const destination = resolveRouteRelativeTo(action || '.', snapshot, routeId, relative);
	if (isAbsoluteDestination(destination)) return destination;
	const path = parsePath(destination);
	if (action === undefined) {
		path.search = snapshot.location.search;
		const search = new URLSearchParams(path.search);
		const values = search.getAll('index');
		if (values.includes('')) {
			search.delete('index');
			for (const value of values) if (value) search.append('index', value);
			const query = search.toString();
			path.search = query ? `?${query}` : '';
		}
	}
	const match =
		routeId === undefined
			? snapshot.matches.at(-1)
			: snapshot.matches.find((candidate) => candidate.id === routeId);
	if ((!action || action === '.') && match?.route.index)
		path.search = path.search ? `?index&${path.search.slice(1)}` : '?index';
	if (basename) path.pathname = path.pathname === '/' ? basename : `${basename}${path.pathname}`;
	return createPath(path);
}
