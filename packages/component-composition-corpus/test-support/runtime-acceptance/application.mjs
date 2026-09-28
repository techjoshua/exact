// Construct the compiler boundary receipt explicitly to verify its descendant-state payload.
import '@exactjs/ssr/runtime/structural-boundaries';
import { createContext } from '@exactjs/core';
import {
	composeExactExecutorContract,
	createExactContextRuntime,
	exactResponseToFetchResponse,
	runWithExactRequestScope
} from '@exactjs/server';
import {
	createServerBoundaryReceipt as boundary,
	createCompiledComponentReceipt as receipt
} from '@exactjs/core/runtime/component-operations';
import {
	renderExactRequestToHtmlResponse,
	renderExactRequestToProgressiveHtmlResponse,
	renderToHydratableProgressiveHtmlResponse
} from '@exactjs/ssr';
import { taskStatusJourney, taskCancellationJourney } from './task-status.mjs';
import { optimisticStateJourney } from './optimistic-state.mjs';
import { resourceDisposalJourney } from './resource-disposal.mjs';
import { operationFixture } from './operations.mjs';

const PageScope = createContext('runtime.page', { scope: 'request', reactive: false });

/** One application contract across native hosts; only the adapter factory varies. */
export function createApplication({
	RuntimePage,
	RuntimeShell,
	RuntimeIsland,
	RuntimeViews,
	NativeProgress,
	runCount,
	createHandler,
	clientCode,
	control
}) {
	const contract = composeExactExecutorContract([NativeProgress, RuntimePage], {
		endpoint: '/__exact'
	});
	const progress = Object.values(contract.invocations).find((value) => value.progress?.length);
	if (!progress) throw new Error('Missing compiled progress receiver');
	const warnings = [];
	const errors = [];
	const logger = {
		log(event) {
			if (event.level === 'warn') warnings.push(event.message);
			if (event.level === 'error') errors.push(event.message);
		}
	};
	const operations = operationFixture(control);
	const contexts = {
		'/__exact': { contract, logger },
		'/buffered': {
			contract: { ...contract, endpoint: '/buffered' },
			logger,
			contextRuntime: createExactContextRuntime(),
			progress: { supported: false, reason: 'test deployment buffers responses' }
		},
		'/operations': operations.context
	};
	const pageState = { created: [], disposed: [] };
	const pageContext = {
		logger,
		requestContexts: [
			[
				PageScope,
				{
					create(scope) {
						const id = scope.request.url.searchParams.get('gate') ?? scope.request.url.pathname;
						pageState.created.push(id);
						return id;
					},
					dispose(id, reason) {
						pageState.disposed.push({ id, reason: String(reason) });
					}
				}
			]
		]
	};

	const handlers = Object.fromEntries(
		Object.entries(contexts).map(([path, context]) => [path, createHandler(context)])
	);
	return {
		contexts,
		async fetch(request, env, ctx) {
			const pathname = new URL(request.url).pathname;
			if (pathname === '/task-cancellation') return Response.json(await taskCancellationJourney());
			if (pathname === '/resource-disposal') return Response.json(await resourceDisposalJourney());
			if (pathname === '/optimistic-state') return Response.json(await optimisticStateJourney());
			if (pathname === '/task-status') return Response.json(await taskStatusJourney());
			if (pathname === '/page-state') return Response.json(pageState);
			if (pathname === '/contract')
				return Response.json({
					id: progress.id,
					receivers: progress.progress.map((receiver) => receiver.id)
				});
			if (pathname === '/runs') return Response.json(runCount());
			if (pathname === '/errors') return Response.json(errors);
			if (pathname === '/warnings') return Response.json(warnings);
			if (pathname === '/operation-state')
				return Response.json({
					...operations.state,
					prototypePolluted: Object.hasOwn(Object.prototype, 'polluted')
				});
			if (pathname === '/client.js')
				return new Response(clientCode, { headers: { 'content-type': 'text/javascript' } });
			if (
				[
					'/page',
					'/stream-page',
					'/committed-page',
					'/island-page',
					'/stream-island-page'
				].includes(pathname)
			) {
				const render =
					pathname === '/stream-page' || pathname === '/stream-island-page'
						? (request, context, make, options) =>
								runWithExactRequestScope(request, context, (scope) =>
									renderToHydratableProgressiveHtmlResponse(make(), {
										...options,
										signal: scope.signal
									})
								)
						: pathname === '/page' || pathname === '/island-page'
							? renderExactRequestToHtmlResponse
							: renderExactRequestToProgressiveHtmlResponse;
				return exactResponseToFetchResponse(
					await render(
						request,
						pageContext,
						() =>
							pathname.includes('island-page')
								? receipt(RuntimeShell, {
										children: boundary('runtime-island', 'RuntimeIsland', {
											__exactHydration: 'eager',
											__exactHydrationFallback: receipt(RuntimeViews.page, {})
										})
									})
								: receipt(RuntimeIsland, {}),
						{
							documentShell: pathname.includes('island-page')
								? undefined
								: (application) =>
										receipt(RuntimeShell, {
											children: application,
											gate: new URL(request.url).searchParams.has('gate')
												? control + '/gate?id=' + new URL(request.url).searchParams.get('gate')
												: undefined
										}),
							hydration: true,
							endpoint: '/__exact',
							bufferSize: 64
						}
					)
				);
			}
			const handler = handlers[pathname];
			return handler ? handler(request, env, ctx) : new Response('not found', { status: 404 });
		}
	};
}
