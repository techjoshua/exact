import { joinTask } from '@exactjs/core';
import { createFrameworkPublicationCommit } from '@exactjs/core/framework/publication';

import type {
	CreateExactRouterOptions,
	ExactRouteDefinition,
	ExactRouter,
	ExactRouterSnapshot,
	FetcherSnapshot,
	HistoryAction,
	NavigationBlocker,
	NavigationOptions
} from './contracts.js';
import {
	hasDataWork,
	hasOwnDataWork,
	locationForUrl,
	normalizeRouteIds,
	redirectResult,
	unwrapDataResult
} from './data-operations.js';
import {
	createKey,
	hrefFor,
	locationValue,
	normalizeBasename,
	normalizePath,
	resolveTarget,
	stripBasename
} from './locations.js';
import { matchRoutes } from './matching.js';
import { RouterOperationCoordinator } from './operation-coordinator.js';
import { createRouteLoader } from './route-loaders.js';

/** Creates an exact router. */
export function createExactRouter<Route extends ExactRouteDefinition>(
	options: CreateExactRouterOptions<Route>
): ExactRouter<Route> {
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
	const operations = new RouterOperationCoordinator(() => {
		revalidation = 'idle';
	});
	const fetchers = new Map<string, FetcherSnapshot>();
	const fetcherAborts = new Map<string, AbortController>();
	const loaderRuntime = createRouteLoader<Route>(options.context);
	const runLoaders = loaderRuntime.run;
	const materializeLazy = loaderRuntime.materialize;
	const hasInitialData = options.hydrationData !== undefined || !routes.some(hasDataWork);
	const listeners = new Set<() => void>();
	const blockers = new Set<NavigationBlocker>();
	let initialized = hasInitialData;
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
		action: HistoryAction,
		navigation: ExactRouterSnapshot<Route>['navigation'] = {
			state: 'idle',
			transitionId: operations.transitionId
		}
	): ExactRouterSnapshot<Route> {
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
			fetchers: new Map(fetchers)
		});
	}

	async function navigate(
		to: string | URL | number,
		options: NavigationOptions = {},
		redirectDepth = 0
	): Promise<void> {
		assertActive();
		if (redirectDepth > 20) throw new Error('Router exceeded the maximum redirect depth of 20');
		if (typeof to === 'number') {
			if (!source.go)
				throw new Error('This router location source does not support delta navigation');
			source.go(to);
			return;
		}
		const target = resolveTarget(to, source.location(), basename, mode);
		const action: HistoryAction = options.replace ? 'REPLACE' : 'PUSH';
		const nextLocation = locationValue(
			{
				location: () => target,
				push() {},
				replace() {},
				state: () => options.state,
				key: () => createKey()
			},
			mode,
			basename
		);
		const transition = Object.freeze({
			currentLocation: snapshot.location,
			nextLocation,
			historyAction: action
		});
		for (const blocker of blockers) if (blocker(transition)) return;

		const operation = operations.beginAuthoritative();
		const currentTransition = operation.id;
		snapshot = Object.freeze({
			...snapshot,
			navigation: Object.freeze({
				state: 'loading',
				location: nextLocation,
				transitionId: currentTransition
			})
		});
		notify();
		const revision = sourceRevision;
		const nextMatches = matchRoutes(routes, nextLocation.pathname);
		const result = nextMatches.some((match) => hasOwnDataWork(match.route))
			? await runLoaders(target, nextMatches, operation.abort.signal)
			: { data: {}, errors: {}, headers: {}, statusCode: 200 };
		if (result.redirect) {
			if (currentTransition !== operations.transitionId) return;
			await navigate(result.redirect, { replace: true, status: result.status }, redirectDepth + 1);
			return;
		}
		if (!operations.owns(operation)) return;
		initialized = true;
		loaderData = result.data;
		errors = result.errors;
		loaderHeaders = result.headers;
		statusCode = result.statusCode;
		let published = false;
		const publish = () => {
			if (published) throw new Error('A navigation publication may commit only once');
			published = true;
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
			return createFrameworkPublicationCommit();
		};
		if (publication) {
			await publication.publish({
				kind: 'navigation',
				signal: operation.abort.signal,
				metadata: {
					historyAction: action,
					from: transition.currentLocation,
					to: nextLocation,
					transitionId: currentTransition
				},
				publish
			});
		} else publish();
	}

	async function initialize(): Promise<void> {
		assertActive();
		if (initialized) return;
		const operation = operations.beginAuthoritative();
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

	async function submit(target: string | URL, init: RequestInit = {}): Promise<void> {
		assertActive();
		const url = resolveTarget(target, source.location(), basename, mode);
		const matches = matchRoutes(routes, stripBasename(normalizePath(url.pathname), basename));
		const actionMatch = [...matches]
			.reverse()
			.find((match) => match.route.action || match.route.lazy);
		if (!actionMatch) throw new Error(`No route action matches ${url.pathname}`);
		const operation = operations.beginAuthoritative();
		const currentTransition = operation.id;
		snapshot = Object.freeze({
			...snapshot,
			navigation: Object.freeze({
				state: 'submitting',
				location: locationForUrl(url, init),
				transitionId: currentTransition
			})
		});
		notify();
		try {
			await materializeLazy(actionMatch.route);
			const result = await actionMatch.route.action!({
				request: new Request(url, init),
				params: actionMatch.params,
				context: options.context,
				signal: operation.abort.signal
			});
			if (!operations.owns(operation)) return;
			const redirect = redirectResult(result);
			if (redirect) {
				await navigate(redirect.location, { replace: true, status: redirect.status });
				return;
			}
			if (result instanceof Response) {
				actionHeaders = { [actionMatch.id]: new Headers(result.headers) };
				statusCode = result.status;
			}
			const data = await unwrapDataResult(result);
			if (!operations.owns(operation)) return;
			actionData = { [actionMatch.id]: data };
			await revalidate(data, operation);
		} catch (error) {
			if (!operations.owns(operation)) return;
			const redirect = redirectResult(error);
			if (redirect) {
				await navigate(redirect.location, { replace: true, status: redirect.status });
				return;
			}
			if (error instanceof Response) {
				actionHeaders = { [actionMatch.id]: new Headers(error.headers) };
				statusCode = error.status;
			} else {
				statusCode = 500;
			}
			errors = { ...errors, [actionMatch.id]: error };
			snapshot = buildSnapshot(snapshot.historyAction);
			notify();
		}
	}

	async function revalidate(
		actionResult?: unknown,
		owner?: Readonly<{ id: number; abort: AbortController }>
	): Promise<void> {
		assertActive();
		const operation = owner ?? operations.beginRevalidation();
		const independentId = owner ? undefined : operations.revalidationId;
		const startingTransition = operations.transitionId;
		const startingRevision = sourceRevision;
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
			await navigate(result.redirect, { replace: true, status: result.status });
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

	async function fetch(
		key: string,
		routeId: string,
		target: string | URL,
		init: RequestInit = {}
	): Promise<void> {
		assertActive();
		const url = resolveTarget(target, source.location(), basename, mode);
		const matches = matchRoutes(routes, stripBasename(normalizePath(url.pathname), basename));
		const match = matches.find((candidate) => candidate.id === routeId);
		if (!match) throw new Error(`Fetcher route ${routeId} does not match ${url.pathname}`);
		const mutation = !!init.method && !/^(?:GET|HEAD)$/i.test(init.method);
		fetchers.set(key, Object.freeze({ state: mutation ? 'submitting' : 'loading' }));
		snapshot = buildSnapshot(snapshot.historyAction);
		notify();
		fetcherAborts.get(key)?.abort();
		const abort = new AbortController();
		fetcherAborts.set(key, abort);
		try {
			await materializeLazy(match.route);
			const handler = mutation ? match.route.action : match.route.loader;
			if (!handler)
				throw new Error(`Route ${routeId} does not define a ${mutation ? 'action' : 'loader'}`);
			const result = await handler({
				request: new Request(url, init),
				params: match.params,
				context: options.context,
				signal: abort.signal
			});
			if (fetcherAborts.get(key) !== abort || abort.signal.aborted) return;
			const redirect = redirectResult(result);
			if (redirect) {
				fetchers.set(key, Object.freeze({ state: 'idle' }));
				await navigate(redirect.location, { replace: true, status: redirect.status });
				return;
			}
			const data = await unwrapDataResult(result);
			fetchers.set(key, Object.freeze({ state: 'idle', data }));
			if (mutation) await revalidate(data);
		} catch (error) {
			if (fetcherAborts.get(key) !== abort || abort.signal.aborted) return;
			const redirect = redirectResult(error);
			if (redirect) {
				fetchers.set(key, Object.freeze({ state: 'idle' }));
				await navigate(redirect.location, { replace: true, status: redirect.status });
				return;
			}
			fetchers.set(key, Object.freeze({ state: 'idle', error }));
		}
		snapshot = buildSnapshot(snapshot.historyAction);
		notify();
		if (fetcherAborts.get(key) === abort) fetcherAborts.delete(key);
	}

	function assertActive(): void {
		if (disposed) throw new Error('Cannot use a disposed router');
	}

	return Object.freeze({
		basename,
		mode,
		getSnapshot: () => snapshot,
		subscribe(listener: () => void) {
			assertActive();
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		sync(action = source.action?.() ?? 'POP', publish = true) {
			assertActive();
			refresh(action, publish);
		},
		setRoutes(nextRoutes: readonly Route[]) {
			assertActive();
			routes = normalizeRouteIds(nextRoutes);
			refresh(snapshot.historyAction);
		},
		createHref: (to: string | URL) => hrefFor(to, source.location(), basename, mode),
		navigate(to: string | URL | number, navigationOptions?: NavigationOptions) {
			return joinRouterOperation(navigate(to, navigationOptions));
		},
		initialize: () => joinRouterOperation(initialize()),
		submit: (target: string | URL, init?: RequestInit) => joinRouterOperation(submit(target, init)),
		fetch: (key: string, routeId: string, target: string | URL, init?: RequestInit) =>
			joinRouterOperation(fetch(key, routeId, target, init)),
		revalidate: () => joinRouterOperation(revalidate()),
		block(blocker: NavigationBlocker) {
			assertActive();
			blockers.add(blocker);
			return () => blockers.delete(blocker);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			operations.dispose();
			for (const abort of fetcherAborts.values()) abort.abort();
			fetcherAborts.clear();
			unsubscribe?.();
			listeners.clear();
			blockers.clear();
		}
	});
}

/**
 * Joins one router promise to a synchronously active form, event, or action interaction.
 *
 * The same promise remains the public router result; joining adds settlement ownership only.
 */
function joinRouterOperation<Result>(operation: Promise<Result>): Promise<Result> {
	joinTask(operation);
	return operation;
}
