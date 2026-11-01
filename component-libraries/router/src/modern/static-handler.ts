import { queryRouteData } from './static-route-query.js';
import { createExactRouter } from '../core/router.js';
import { taskAwait } from '@exactjs/core';
import type { CreateExactRouterOptions } from '../core/contracts.js';
import { createStaticLocationSource, requestInit } from './browser.js';
import type { RouteObject, StaticHandlerContext } from './context.js';

/** Resolves loader or action data for server rendering and releases request-owned work on settlement. */
export function createStaticHandler(
	routes: readonly RouteObject[],
	options: { basename?: string } = {}
): {
	dataRoutes: readonly RouteObject[];
	/** Loads matched page data and returns a static rendering context or followed redirect. */
	query(
		request: Request,
		init?: { requestContext?: unknown }
	): Promise<Response | StaticHandlerContext>;
	/** Invokes one URL-selected or explicitly matched handler, preserving its raw result or thrown value. */
	queryRoute(
		request: Request,
		options?: { routeId?: string; requestContext?: unknown }
	): Promise<unknown>;
} {
	return {
		dataRoutes: routes,
		query(request, init = {}) {
			return queryStaticRouter(request, routes, {
				basename: options.basename,
				context: init.requestContext
			});
		},
		queryRoute(request, queryOptions = {}) {
			return queryRouteData(request, routes, { ...queryOptions, basename: options.basename });
		}
	};
}

/** Owns one request router through preparation, querying, result selection, and unconditional cleanup. */
async function queryStaticRouter(
	request: Request,
	routes: readonly RouteObject[],
	options: Pick<CreateExactRouterOptions<RouteObject>, 'basename' | 'context'>
): Promise<Response | StaticHandlerContext> {
	request.signal.throwIfAborted();
	const statics = createStaticLocationSource(request.url);
	const router = createExactRouter({ ...options, request, source: statics.source, routes });
	const abort = () => router.dispose();
	request.signal.addEventListener('abort', abort, { once: true });
	try {
		request.signal.throwIfAborted();
		const read = /^(?:GET|HEAD)$/i.test(request.method);
		await taskAwait(
			request.signal,
			read
				? router.initialize()
				: (async () => router.submit(request.url, await requestInit(request)))()
		);
		request.signal.throwIfAborted();
		const redirected = statics.redirect();
		if (redirected)
			return new Response(null, {
				status: redirected.status,
				headers: { Location: redirected.location.href }
			});
		const snapshot = router.getSnapshot();
		return {
			location: snapshot.location,
			matches: snapshot.matches,
			loaderData: snapshot.loaderData,
			actionData: snapshot.actionData,
			errors: snapshot.errors,
			statusCode: snapshot.statusCode,
			loaderHeaders: snapshot.loaderHeaders,
			actionHeaders: snapshot.actionHeaders
		};
	} catch (error) {
		if (request.signal.aborted) throw request.signal.reason;
		throw error;
	} finally {
		request.signal.removeEventListener('abort', abort);
		router.dispose();
	}
}
