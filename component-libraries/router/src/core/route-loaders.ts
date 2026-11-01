import type { ExactDataFunctionArgs, ExactRouteDefinition, RouteMatch } from './contracts.js';
import { redirectResult, unwrapDataResult } from './data-operations.js';
import { setRouteRecordValue } from './route-records.js';

/** Describes the result produced by route loader. */
export type RouteLoaderResult = Readonly<{
	data: Record<string, unknown>;
	errors: Record<string, unknown>;
	headers: Record<string, Headers>;
	statusCode: number;
	redirect?: string;
	status?: number;
}>;

/**
 * Creates a loader runner whose lazy-route cache is scoped to one router.
 *
 * Keeping the cache with the runner prevents different router instances from
 * sharing route materialization state when they happen to reuse definitions.
 */
export function createRouteLoader<Route extends ExactRouteDefinition>(
	context: ExactDataFunctionArgs['context'],
	request?: Pick<Request, 'method' | 'headers'>
): Readonly<{
	run(
		url: URL,
		matches: readonly RouteMatch<Route>[],
		signal: AbortSignal,
		initial?: Readonly<Record<string, unknown>>
	): Promise<RouteLoaderResult>;
	materialize(route: Route): Promise<void>;
}> {
	const lazyPromises = new WeakMap<object, Promise<void>>();

	const materializeLazy = async (route: Route): Promise<void> => {
		if (!route.lazy) return;
		let pending = lazyPromises.get(route);
		if (!pending) {
			pending = route.lazy().then((values) => {
				Object.assign(route, values, { lazy: undefined });
			});
			lazyPromises.set(route, pending);
		}
		try {
			await pending;
		} catch (error) {
			if (lazyPromises.get(route) === pending) lazyPromises.delete(route);
			throw error;
		}
	};

	const run = async (
		url: URL,
		matches: readonly RouteMatch<Route>[],
		signal: AbortSignal,
		initial: Readonly<Record<string, unknown>> = {}
	): Promise<RouteLoaderResult> => {
		const data = { ...initial };
		const errors: Record<string, unknown> = {};
		const headers: Record<string, Headers> = {};
		const results = await Promise.all(
			matches.map(async (match) => {
				try {
					signal.throwIfAborted();
					await materializeLazy(match.route);
					signal.throwIfAborted();
					if (!match.route.loader) return { match };
					const value = await match.route.loader({
						request: new Request(url, {
							signal,
							headers: request?.headers,
							method: request?.method === 'HEAD' ? 'HEAD' : 'GET'
						}),
						params: match.params,
						context,
						signal
					});
					const redirect = redirectResult(value);
					if (redirect) return { match, redirect };
					return { match, value, data: await unwrapDataResult(value) };
				} catch (error) {
					const redirect = redirectResult(error);
					if (redirect) return { match, redirect };
					return { match, error };
				}
			})
		);
		let redirect: { location: string; status: number } | undefined;
		let statusCode = 200;
		for (const result of results) {
			if (result.redirect) {
				redirect = result.redirect;
				continue;
			}
			if ('error' in result) {
				setRouteRecordValue(errors, result.match.id, result.error);
				if (result.error instanceof Response) {
					setRouteRecordValue(headers, result.match.id, new Headers(result.error.headers));
					statusCode = result.error.status;
				} else {
					statusCode = 500;
				}
				continue;
			}
			if (!('value' in result)) continue;
			setRouteRecordValue(data, result.match.id, result.data);
			if (result.value instanceof Response) {
				setRouteRecordValue(headers, result.match.id, new Headers(result.value.headers));
				statusCode = result.value.status;
			}
		}
		return {
			data,
			errors,
			headers,
			statusCode,
			...(redirect ? { redirect: redirect.location, status: redirect.status } : {})
		};
	};
	return Object.freeze({ run, materialize: materializeLazy });
}
