import { normalizeRouteIds } from '../core/data-operations.js';
import { selectDataRoute } from '../core/data-targets.js';
import { normalizeBasename, normalizePath, stripBasename } from '../core/locations.js';
import { matchRoutes } from '../core/matching.js';
import { runRequestOperation } from '../core/request-cancellation.js';
import { createRouteLoader } from '../core/route-loaders.js';
import type { RouteObject } from './context.js';

/**
 * Invokes only the matched route's loader or action and preserves its returned or thrown value.
 * Validates selection before handler side effects, fences lazy dispatch after cancellation, and
 * releases its private request signal on settlement without canceling the caller's signal.
 */
export function queryRouteData(
	request: Request,
	routes: readonly RouteObject[],
	options: { basename?: string; routeId?: string; requestContext?: unknown }
): Promise<unknown> {
	return runRequestOperation(request.signal, async (own) => {
		if (!/^(?:GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)$/i.test(request.method))
			throw queryError(
				405,
				'Method Not Allowed',
				`Unsupported route query method ${request.method}`
			);
		const url = new URL(request.url);
		const pathname = stripBasename(
			normalizePath(url.pathname),
			normalizeBasename(options.basename)
		);
		const matches = matchRoutes(normalizeRouteIds(routes), pathname);
		const match = selectDataRoute(matches, url, options.routeId);
		if (!match)
			throw queryError(
				options.routeId === undefined ? 404 : 403,
				options.routeId === undefined ? 'Not Found' : 'Forbidden',
				`No query route ${options.routeId ?? ''} matches ${url.pathname}`
			);
		const abort = new AbortController();
		own(abort, () => {});
		try {
			await createRouteLoader<RouteObject>(options.requestContext).materialize(match.route);
			abort.signal.throwIfAborted();
			const read = /^(?:GET|HEAD|OPTIONS)$/i.test(request.method);
			const handler = read ? match.route.loader : match.route.action;
			if (!handler)
				throw queryError(
					read ? 400 : 405,
					read ? 'Bad Request' : 'Method Not Allowed',
					`Route ${match.id} does not define a ${read ? 'loader' : 'action'}`
				);
			return await handler({
				request: new Request(request, { signal: abort.signal }),
				params: match.params,
				context: options.requestContext,
				signal: abort.signal
			});
		} finally {
			abort.abort();
		}
	});
}

/** Carries internal query failure status through the compatibility route-error contract. */
function queryError(status: number, statusText: string, message: string): Error {
	return Object.assign(new Error(message), { status, statusText, data: message });
}
