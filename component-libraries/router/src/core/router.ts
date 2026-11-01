import { selectDataRoute } from './data-targets.js';
import { prepareRouteAction } from './submission.js';
import { attachSuppressedCleanupFailure } from '@exactjs/core';
import type * as Contracts from './contracts.js';
import {
	hasDataWork,
	hasOwnDataWork,
	locationForUrl,
	normalizeRouteIds
} from './data-operations.js';
import * as routerLifecycle from './lifecycle.js';
import {
	hrefFor,
	locationValue,
	normalizeBasename,
	navigationLocation,
	normalizePath,
	resolveTarget,
	stripBasename
} from './locations.js';
import { matchRoutes } from './matching.js';
import { idleRouterNavigation, publishRouterNavigation } from './navigation-publication.js';
import * as routerOperation from './operation-coordinator.js';
import { createRouteLoader } from './route-loaders.js';
import { navigateHistory } from './location-sources.js';
import { runRequestOperation, type OwnRequestCancellation } from './request-cancellation.js';
import { createFetcherRuntime } from './fetchers.js';

/**
 * Creates router state over the supplied location source and subscribes to its changes.
 * Defaults to history URL interpretation. The source supplies the actual browser, memory,
 * or request-backed location behavior. Call `initialize()` to load initial route data when
 * needed, and `dispose()` to cancel router work and release subscriptions when finished.
 */
export function createExactRouter<Route extends Contracts.ExactRouteDefinition>(
	options: Contracts.CreateExactRouterOptions<Route>
): Contracts.ExactRouter<Route> {
	const source = options.source;
	const publication = options.publication;
	const basename = normalizeBasename(options.basename);
	const mode = options.mode ?? 'history';
	let routes = normalizeRouteIds(options.routes ?? []);
	let disposed = false;
	let sourceRevision = 0;
	let loaderData: Record<string, unknown> = { ...(options.hydrationData?.loaderData ?? {}) };
	let actionData: Record<string, unknown> = { ...(options.hydrationData?.actionData ?? {}) };
	let errors: Record<string, unknown> = { ...(options.hydrationData?.errors ?? {}) };
	let statusCode = 200;
	let loaderHeaders: Record<string, Headers> = {};
	let actionHeaders: Record<string, Headers> = {};
	let revalidation: 'idle' | 'loading' = 'idle';
	const operations = new routerOperation.RouterOperationCoordinator(() => {
		revalidation = 'idle';
	});
	const join = routerOperation.joinRouterOperation;
	const loaderRuntime = createRouteLoader<Route>(options.context, options.request);
	const runLoaders = loaderRuntime.run;
	const materializeLazy = loaderRuntime.materialize;
	const hasInitialData = options.hydrationData !== undefined || !routes.some(hasDataWork);
	const listeners = new Set<() => void>();
	const blockers = new Set<Contracts.NavigationBlocker>();
	let initialized = hasInitialData;
	const fetchers = createFetcherRuntime<Route>({
		context: options.context,
		assertActive: () => routerOperation.assertRouterActive(disposed),
		resolve(target) {
			const url = resolveTarget(target, source.location(), basename, mode);
			return {
				url,
				matches: matchRoutes(routes, stripBasename(normalizePath(url.pathname), basename))
			};
		},
		materialize: materializeLazy,
		navigate: (target, options, own) => navigate(target, options, 0, own),
		revalidate: (data, own) => revalidate(data, undefined, own),
		publish: publishFetchers
	});
	let snapshot = buildSnapshot(source.action?.() ?? 'POP');

	const notify = () => listeners.forEach((listener) => listener());
	const refresh = (action = source.action?.() ?? 'POP', publish = true) => {
		if (disposed) return;
		sourceRevision++;
		snapshot = buildSnapshot(action);
		if (publish) notify();
	};
	const unsubscribe = source.subscribe?.(refresh);

	function buildSnapshot(
		action: Contracts.HistoryAction,
		navigation: Contracts.ExactRouterSnapshot<Route>['navigation'] = idleRouterNavigation(
			operations.transitionId
		)
	): Contracts.ExactRouterSnapshot<Route> {
		const location = locationValue(source, mode, basename);
		const matches = matchRoutes(routes, location.pathname);
		return Object.freeze({
			location,
			historyAction: action,
			matches,
			params: Object.freeze({ ...(matches.at(-1)?.params ?? {}) }),
			initialized,
			navigation: Object.freeze(navigation),
			loaderData: Object.freeze({ ...loaderData }),
			actionData: Object.freeze({ ...actionData }),
			errors: Object.freeze({ ...errors }),
			statusCode,
			loaderHeaders: Object.freeze({ ...loaderHeaders }),
			actionHeaders: Object.freeze({ ...actionHeaders }),
			revalidation,
			fetchers: new Map(fetchers.snapshots)
		});
	}

	/** Publishes only navigation state without exposing prepared route data. */
	function publishNavigation(navigation: Contracts.ExactRouterSnapshot<Route>['navigation']): void {
		snapshot = Object.freeze({ ...snapshot, navigation: Object.freeze(navigation) });
		notify();
	}

	/** Settles only the failed operation that still owns the view, preserving its primary error. */
	function failNavigation(operation: routerOperation.RouterOperation, primary: unknown): void {
		if (!operations.owns(operation) || snapshot.navigation.state === 'idle') return;
		try {
			publishNavigation(idleRouterNavigation(operation.id));
		} catch (cleanup) {
			attachSuppressedCleanupFailure(primary, cleanup);
		}
		operation.abort.abort();
	}

	/** Binds cancellation to this navigation identity while preserving newer callback-owned work. */
	function ownNavigation(
		operation: routerOperation.RouterOperation,
		own?: OwnRequestCancellation
	): void {
		const ownedRevalidation = operations.revalidationId;
		own?.(operation.abort, () => {
			if (disposed || operation.id !== operations.transitionId) return;
			if (ownedRevalidation === operations.revalidationId) revalidation = 'idle';
			snapshot = buildSnapshot(snapshot.historyAction);
			notify();
		});
	}

	async function navigate(
		to: string | URL | number,
		options: Contracts.NavigationOptions = {},
		redirectDepth = 0,
		own?: OwnRequestCancellation
	): Promise<void> {
		routerOperation.assertRouterActive(disposed);
		if (redirectDepth > 20) throw new Error('Router exceeded the maximum redirect depth of 20');
		if (typeof to === 'number') {
			navigateHistory(source, to);
			return;
		}
		const target = resolveTarget(to, source.location(), basename, mode);
		const action: Contracts.HistoryAction = options.replace ? 'REPLACE' : 'PUSH';
		const nextLocation = navigationLocation(target, options, mode, basename);
		const transition = Object.freeze({
			currentLocation: snapshot.location,
			nextLocation,
			historyAction: action
		});
		for (const blocker of blockers) if (blocker(transition)) return;

		const operation = operations.beginAuthoritative();
		ownNavigation(operation, own);
		if (!operations.owns(operation)) return;
		const currentTransition = operation.id;
		try {
			publishNavigation({
				state: 'loading',
				location: nextLocation,
				transitionId: currentTransition
			});
			const revision = sourceRevision;
			const nextMatches = matchRoutes(routes, nextLocation.pathname);
			const result = nextMatches.some((match) => hasOwnDataWork(match.route))
				? await runLoaders(target, nextMatches, operation.abort.signal)
				: { data: {}, errors: {}, headers: {}, statusCode: 200 };
			if (result.redirect) {
				if (currentTransition !== operations.transitionId) return;
				await navigate(
					result.redirect,
					{ replace: true, status: result.status },
					redirectDepth + 1,
					own
				);
				return;
			}
			if (!operations.owns(operation)) return;
			await publishRouterNavigation({
				publication,
				signal: operation.abort.signal,
				metadata: {
					historyAction: action,
					from: transition.currentLocation,
					to: nextLocation,
					transitionId: currentTransition
				},
				commit() {
					if (!operations.owns(operation)) return;
					const revisionBeforeWrite = sourceRevision;
					const previous = { initialized, loaderData, errors, loaderHeaders, statusCode };
					try {
						initialized = true;
						loaderData = result.data;
						errors = result.errors;
						loaderHeaders = result.headers;
						statusCode = result.statusCode;

						if (options.replace) source.replace(target, options.state, options.status);
						else source.push(target, options.state, options.status);
						if (operations.owns(operation) && sourceRevision === revision) {
							// Sources with subscriptions refresh themselves. Request-backed sources do
							// not navigate locally, so retain their location and only settle state.
							snapshot = source.subscribe
								? buildSnapshot(action)
								: Object.freeze({
										...snapshot,
										navigation: Object.freeze({ state: 'idle', transitionId: currentTransition })
									});
							notify();
						}
					} catch (error) {
						if (operations.owns(operation) && sourceRevision === revisionBeforeWrite)
							({ initialized, loaderData, errors, loaderHeaders, statusCode } = previous);
						throw error;
					}
				}
			});
		} catch (error) {
			failNavigation(operation, error);
			throw error;
		}
	}

	async function initialize(): Promise<void> {
		routerOperation.assertRouterActive(disposed);
		if (initialized) return;
		const operation = operations.beginAuthoritative();
		if (!operations.owns(operation)) return;
		const result = await runLoaders(source.location(), snapshot.matches, operation.abort.signal);
		if (!operations.owns(operation)) return;
		if (result.redirect) {
			await navigate(result.redirect, { replace: true, status: result.status });
			initialized = true;
			snapshot = buildSnapshot(snapshot.historyAction);
			notify();
			return;
		}
		loaderData = result.data;
		errors = result.errors;
		loaderHeaders = result.headers;
		statusCode = result.statusCode;
		initialized = true;
		snapshot = buildSnapshot(snapshot.historyAction);
		notify();
	}

	async function submit(
		target: string | URL,
		init: RequestInit,
		own: OwnRequestCancellation
	): Promise<void> {
		routerOperation.assertRouterActive(disposed);
		const url = resolveTarget(target, source.location(), basename, mode);
		const matches = matchRoutes(routes, stripBasename(normalizePath(url.pathname), basename));
		const actionMatch = selectDataRoute(matches, url);
		if (!actionMatch || (!actionMatch.route.action && !actionMatch.route.lazy))
			throw new Error(`No route action matches ${url.pathname}`);
		const operation = operations.beginAuthoritative();
		ownNavigation(operation, own);
		if (!operations.owns(operation)) return;
		const currentTransition = operation.id;
		publishNavigation({
			state: 'submitting',
			location: locationForUrl(url, init),
			transitionId: currentTransition
		});
		const result = await prepareRouteAction(
			actionMatch,
			{ url, init, context: options.context, signal: operation.abort.signal },
			materializeLazy
		);
		if (!result || !operations.owns(operation)) return;
		if (result.kind === 'redirect') {
			await navigate(result.location, { replace: true, status: result.status }, 0, own);
			return;
		}
		if (result.headers) actionHeaders = { [actionMatch.id]: result.headers };
		if (result.status !== undefined) statusCode = result.status;
		if (result.kind === 'error') {
			errors = { ...errors, [actionMatch.id]: result.error };
			snapshot = buildSnapshot(snapshot.historyAction);
			notify();
		} else {
			actionData = { [actionMatch.id]: result.data };
			await revalidate(result.data, operation, own);
		}
	}

	async function revalidate(
		actionResult?: unknown,
		owner?: Readonly<{ id: number; abort: AbortController }>,
		own?: OwnRequestCancellation
	): Promise<void> {
		routerOperation.assertRouterActive(disposed);
		const operation = owner ?? operations.beginRevalidation();
		if (operation.abort.signal.aborted) return;
		const independentId = owner ? undefined : operations.revalidationId;
		const startingTransition = operations.transitionId;
		const startingRevision = sourceRevision;
		if (!owner)
			own?.(operation.abort, () => {
				if (
					disposed ||
					independentId !== operations.revalidationId ||
					operations.transitionId !== startingTransition ||
					sourceRevision !== startingRevision
				)
					return;
				revalidation = 'idle';
				snapshot = Object.freeze({ ...snapshot, revalidation });
				notify();
			});
		if (operation.abort.signal.aborted) return;
		revalidation = 'loading';
		snapshot = buildSnapshot(snapshot.historyAction);
		notify();
		const currentUrl = source.location();
		const selected = snapshot.matches.filter(
			(match) =>
				match.route.shouldRevalidate?.({
					currentUrl,
					nextUrl: currentUrl,
					currentParams: match.params,
					nextParams: match.params,
					actionResult,
					defaultShouldRevalidate: true
				}) ?? true
		);
		const result = await runLoaders(currentUrl, selected, operation.abort.signal, loaderData);
		const current = owner
			? operations.owns(owner)
			: independentId === operations.revalidationId &&
				operations.transitionId === startingTransition &&
				sourceRevision === startingRevision &&
				!operation.abort.signal.aborted;
		if (!current) return;
		if (result.redirect) {
			revalidation = 'idle';
			await navigate(result.redirect, { replace: true, status: result.status }, 0, own);
			return;
		}
		loaderData = result.data;
		errors = result.errors;
		loaderHeaders = result.headers;
		statusCode = result.statusCode !== 200 || !owner ? result.statusCode : statusCode;
		revalidation = 'idle';
		snapshot = buildSnapshot(snapshot.historyAction);
		notify();
	}

	/** Publishes fetcher changes without treating them as a location revision. */
	function publishFetchers(): void {
		snapshot = buildSnapshot(snapshot.historyAction);
		notify();
	}

	return {
		basename,
		mode,
		getSnapshot: () => snapshot,
		subscribe: (listener) => {
			routerOperation.assertRouterActive(disposed);
			return routerLifecycle.subscribeResource(listeners, listener);
		},
		sync(action = source.action?.() ?? 'POP', publish = true) {
			routerOperation.assertRouterActive(disposed);
			refresh(action, publish);
		},
		setRoutes(nextRoutes) {
			routerOperation.assertRouterActive(disposed);
			routes = normalizeRouteIds(nextRoutes);
			refresh(snapshot.historyAction);
		},
		releaseFetcher(key: string) {
			if (disposed) return;
			fetchers.release(key);
		},
		createHref: (to) => hrefFor(to, source.location(), basename, mode),
		navigate(to, navigationOptions) {
			return join(navigate(to, navigationOptions));
		},
		initialize: () => join(initialize()),
		submit: (target, init = {}) =>
			join(runRequestOperation(init.signal, (own) => submit(target, init, own))),
		fetch: (key, routeId, target, init = {}) =>
			join(
				runRequestOperation(init.signal, (own) => fetchers.fetch(key, routeId, target, init, own))
			),
		revalidate: () => join(revalidate()),
		block: (blocker) => {
			routerOperation.assertRouterActive(disposed);
			return routerLifecycle.subscribeResource(blockers, blocker);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			routerLifecycle.disposeRouterResources(
				fetchers.dispose,
				operations,
				unsubscribe,
				listeners,
				blockers
			);
		}
	};
}
