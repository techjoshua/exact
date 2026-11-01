import { withTaskSignal } from '@exactjs/core';
import type {
	ExactRouteDefinition,
	FetcherSnapshot,
	NavigationOptions,
	RouteMatch
} from './contracts.js';
import { selectFetcherRoute } from './data-targets.js';
import { redirectResult, unwrapDataResult } from './data-operations.js';
import * as routerLifecycle from './lifecycle.js';
import type { OwnRequestCancellation } from './request-cancellation.js';

/** Supplies router-owned routing and publication boundaries to the keyed fetcher lifetime. */
interface FetcherPorts<Route extends ExactRouteDefinition> {
	context: unknown;
	assertActive(): void;
	resolve(target: string | URL): { url: URL; matches: readonly RouteMatch<Route>[] };
	materialize(route: Route): Promise<void>;
	navigate(target: string, options: NavigationOptions, own: OwnRequestCancellation): Promise<void>;
	revalidate(data: unknown, own: OwnRequestCancellation): Promise<void>;
	publish(): void;
}

/** Owns keyed fetcher state, cancellation controllers, handler dispatch and stale-result fencing. */
export function createFetcherRuntime<Route extends ExactRouteDefinition>(
	ports: FetcherPorts<Route>
) {
	const fetchers = new Map<string, FetcherSnapshot>();
	const fetcherAborts = new Map<string, AbortController>();

	async function fetch(
		key: string,
		routeId: string | undefined,
		target: string | URL,
		init: RequestInit,
		own: OwnRequestCancellation
	): Promise<void> {
		ports.assertActive();
		const { url, matches } = ports.resolve(target);
		const match = selectFetcherRoute(matches, routeId, url);
		const mutation = !!init.method && !/^(?:GET|HEAD)$/i.test(init.method);
		const abort = routerLifecycle.startFetcherOperation(
			key,
			fetchers,
			fetcherAborts,
			mutation ? 'submitting' : 'loading',
			ports.publish
		);
		if (!abort) return;
		own(abort, () => {
			if (fetcherAborts.get(key) === abort)
				routerLifecycle.releaseFetcherResources(key, fetchers, fetcherAborts, ports.publish);
		});
		if (abort.signal.aborted) return;
		try {
			await ports.materialize(match.route);
			if (fetcherAborts.get(key) !== abort || abort.signal.aborted) return;
			const handler = mutation ? match.route.action : match.route.loader;
			if (!handler)
				throw new Error(`Route ${match.id} does not define a ${mutation ? 'action' : 'loader'}`);
			const result = await handler({
				request: new Request(url, withTaskSignal(init, abort.signal)),
				params: match.params,
				context: ports.context,
				signal: abort.signal
			});
			if (fetcherAborts.get(key) !== abort || abort.signal.aborted) return;
			const redirect = redirectResult(result);
			if (redirect) {
				fetchers.set(key, Object.freeze({ state: 'idle' }));
				await ports.navigate(redirect.location, { replace: true, status: redirect.status }, own);
				return;
			}
			const data = await unwrapDataResult(result);
			if (fetcherAborts.get(key) !== abort || abort.signal.aborted) return;
			fetchers.set(key, Object.freeze({ state: 'idle', data }));
			if (mutation) await ports.revalidate(data, own);
		} catch (error) {
			if (fetcherAborts.get(key) !== abort || abort.signal.aborted) return;
			const redirect = redirectResult(error);
			if (redirect) {
				fetchers.set(key, Object.freeze({ state: 'idle' }));
				await ports.navigate(redirect.location, { replace: true, status: redirect.status }, own);
				return;
			}
			fetchers.set(key, Object.freeze({ state: 'idle', error }));
		} finally {
			routerLifecycle.finishFetcherOperation(key, abort, fetcherAborts, ports.publish);
		}
	}

	return {
		snapshots: fetchers,
		fetch,
		release(key: string): void {
			routerLifecycle.releaseFetcherResources(key, fetchers, fetcherAborts, ports.publish);
		},
		dispose(): void {
			const owned = [...fetcherAborts.values()];
			fetcherAborts.clear();
			for (const abort of owned) abort.abort();
		}
	};
}
