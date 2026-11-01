import type { ExactDataFunctionArgs, ExactRouteDefinition, RouteMatch } from './contracts.js';
import { withTaskSignal } from '@exactjs/core';
import { redirectResult, unwrapDataResult } from './data-operations.js';

/** One prepared action result whose metadata and follow-up share publication ownership. */
export type RouteActionResult =
	| { kind: 'redirect'; location: string; status: number }
	| { kind: 'data'; data: unknown; headers?: Headers; status?: number }
	| { kind: 'error'; error: unknown; headers?: Headers; status: number };

/** Prepares action work without publishing router state or absorbing delegated navigation failures. */
export async function prepareRouteAction<Route extends ExactRouteDefinition>(
	match: RouteMatch<Route>,
	input: { url: URL; init: RequestInit; context: unknown; signal: AbortSignal },
	materialize: (route: Route) => Promise<void>
): Promise<RouteActionResult | undefined> {
	try {
		await materialize(match.route);
		if (input.signal.aborted) return;
		const args: ExactDataFunctionArgs = {
			request: new Request(input.url, withTaskSignal(input.init, input.signal)),
			params: match.params,
			context: input.context,
			signal: input.signal
		};
		const result = await match.route.action!(args);
		if (input.signal.aborted) return;
		const redirect = redirectResult(result);
		if (redirect) return { kind: 'redirect', ...redirect };
		const headers = result instanceof Response ? new Headers(result.headers) : undefined;
		const status = result instanceof Response ? result.status : undefined;
		const data = await unwrapDataResult(result);
		if (input.signal.aborted) return;
		return { kind: 'data', data, headers, status };
	} catch (error) {
		if (input.signal.aborted) return;
		const redirect = redirectResult(error);
		if (redirect) return { kind: 'redirect', ...redirect };
		return {
			kind: 'error',
			error,
			headers: error instanceof Response ? new Headers(error.headers) : undefined,
			status: error instanceof Response ? error.status : 500
		};
	}
}
