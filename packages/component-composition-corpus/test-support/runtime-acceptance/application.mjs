import { createContext } from '@exactjs/core';
import {
	composeExactExecutorContract,
	createExactContextRuntime,
	exactResponseToFetchResponse,
	runWithExactRequestScope
} from '@exactjs/server';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import {
	renderExactRequestToHtmlResponse,
	renderExactRequestToProgressiveHtmlResponse,
	renderToHydratableProgressiveHtmlResponse
} from '@exactjs/ssr';
import { operationFixture } from './operations.mjs';

const PageScope = createContext('runtime.page', { scope: 'request', reactive: false });

/** One application contract across native hosts; only the adapter factory varies. */
export function createApplication({
	RuntimePage,
	RuntimeShell,
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
			if (pathname === '/page' || pathname === '/stream-page' || pathname === '/committed-page') {
				const render =
					pathname === '/stream-page'
						? (request, context, make, options) =>
								runWithExactRequestScope(request, context, (scope) =>
									renderToHydratableProgressiveHtmlResponse(make(), {
										...options,
										signal: scope.signal
									})
								)
						: pathname === '/page'
							? renderExactRequestToHtmlResponse
							: renderExactRequestToProgressiveHtmlResponse;
				return exactResponseToFetchResponse(
					await render(request, pageContext, () => receipt(RuntimePage, {}), {
						documentShell: (application) =>
							receipt(RuntimeShell, {
								children: application,
								gate: new URL(request.url).searchParams.has('gate')
									? control + '/gate?id=' + new URL(request.url).searchParams.get('gate')
									: undefined
							}),
						hydration: true,
						endpoint: '/__exact',
						bufferSize: 64
					})
				);
			}
			const handler = handlers[pathname];
			return handler ? handler(request, env, ctx) : new Response('not found', { status: 404 });
		}
	};
}
