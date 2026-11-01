import { verifyInspectionQueryLimits } from '../inspection-query-limits-journey.ts';
import * as inspectionQueryLimitApi from '@exactjs/devtools-protocol';
import {
	verifySsrPropCancellation,
	verifySsrPropPreparationCleanup,
	verifyProgressiveUnwindCancellation
} from '../ssr-prop-cancellation-journey.ts';
import { verifyExpressCancellation } from '../express-cancellation-journey.ts';
import { verifyRequestRedirectTransaction } from '../request-redirect-journey.ts';
import { createRequestContextValue, commitRequestResponseState } from '@exactjs/request';
import {
	verifyTaskProgressCancellation,
	verifyTaskFrameCancellation
} from '../task-progress-cancellation-journey.ts';
import { verifyServerStreamCancellation } from '../server-stream-cancellation-journey.ts';
import { verifyProducedResponseCancellation } from '../produced-response-cancellation-journey.ts';
import { verifyServerContextCancellation } from '../server-context-cancellation-journey.ts';
import { verifySsrSchedulerGrant } from '../ssr-scheduler-grant-journey.ts';
import { verifySsrCancellationReasons } from '../ssr-cancellation-reasons-journey.ts';
import { renderToDocumentStream, renderToProgressiveHtmlStream } from '@exactjs/ssr';
import * as reactChildArrayApi from '@exactjs/react-compat';
import { toReactNode as projectReactChildren } from '@exactjs/react-compat/exact';
import * as reactChildArrayServer from '@exactjs/react-dom-compat/server-browser19';
import { verifyReactChildArrayServer } from '../react-child-array-journey.ts';
import { createServerBoundary } from '@exactjs/core/runtime/render';
import {
	createHydrationRecordScript,
	verifyIslandPublicationBudget
} from '../hydration-record-journey.ts';
import {
	verifyRouterRedirectFailures,
	verifyRouterPublicationData,
	verifyRouterFailureOwnership
} from '../router-navigation-journey.ts';
import * as routerNavigationApi from '../../../../component-libraries/router/src/core.ts';
import {
	verifyFetcherDataTargets,
	verifyDataActionTargets
} from '../router-fetcher-target-journey.ts';
import {
	verifyNavigationAbortOwnership,
	verifyRevalidationAbortOwnership
} from '../router-operation-ownership-journey.ts';
import {
	verifyRouteMatching,
	verifyRouteMatchingTransitions,
	verifyCompatibilityBasenames
} from '../router-matching-journey.js';
import { verifySingleRouteQueries } from '../static-route-query-journey.js';
import {
	verifyStaticQueryCancellation,
	verifyHandlerRequestSignals,
	verifyStaticRequestDetails,
	verifyCallerRequestCancellation,
	verifyDelegatedRequestCancellation
} from '../router-request-cancellation-journey.ts';
import { verifyRouteRecords } from '../router-record-journey.ts';
import {
	verifyFetcherPublication,
	verifyFetcherAbortReplacement,
	verifyFetcherPublicationFailure
} from '../router-fetcher-publication-journey.ts';
import { markerKeySnapshots, verifyMarkerEncoding } from '../list-marker-journey.ts';
import { verifyStaticRouterQueries } from '../static-router-query-journey.ts';
import { matchRoutes as matchCompatibilityRoutes } from '../../../../component-libraries/router/src/modern/rendering.ts';
import { createStaticHandler } from '../../../../component-libraries/router/src/modern/static-handler.ts';
import * as markerProtocolApi from '@exactjs/core';
import { verifyArrayEndMutations } from '../array-end-mutation-journey.ts';
import { verifyReactiveProtocolCollections } from '../reactive-protocol-journey.ts';
import * as reactiveProtocolApi from '@exactjs/reactive';
import { encodeValidatedReactiveCollection } from '@exactjs/reactive/framework/protocol';
import { inspectionResponseJourney } from './inspection-responses.mjs';
import { verifyInspectionResponseEncoding } from '../inspection-response-encoding-journey.ts';
import { inspectionPreviewJourney } from './inspection-preview.mjs';
import { inspectionCatalogJourney } from './inspection-catalog.mjs';
import { cleanupValuesJourney } from './cleanup-values.mjs';
import { pluginOutputJourney } from './plugin-output.mjs';
import { secretResolverJourney } from './secret-resolver.mjs';
import { readinessCleanupJourney } from './readiness-cleanup.mjs';
import { urlCoercionJourney } from './url-coercion.mjs';
import { serializationSafety } from './serialization-safety.mjs';
import { exactEnhancementCatalog } from '@exactjs/core/framework/enhancement-catalog';
import { bootstrapLoadingResponse } from './bootstrap-loading.mjs';
import { createExpression } from '@exactjs/core/runtime/render-operations';
// Construct the compiler boundary receipt explicitly to verify its descendant-state payload.
import '@exactjs/ssr/runtime/structural-boundaries';
import { createContext, createEnhancementNode } from '@exactjs/core';
import {
	composeExactExecutorContract,
	createExactHydrationConfig,
	createExactContextRuntime,
	createExpressHandler,
	defineExactOperationContract,
	createExactProducedResponse,
	createExactAsyncProducedResponse,
	exactResponseToFetchResponse,
	runWithExactRequestScope
} from '@exactjs/server';
import {
	createServerBoundaryReceipt as boundary,
	createCompiledComponentInputReceipt as receipt,
	createCompiledKeyedChildReceipt,
	componentInputRecipe,
	redeemComponentInput,
	createCompiledIntrinsicReceipt
} from '@exactjs/core/runtime/component-operations';
import {
	renderHydrationScript,
	renderKeyedListSnapshot,
	parseKeyedListSnapshotHtml,
	diffKeyedListItems,
	renderExactRequestToHtmlResponse,
	renderExactRequestToProgressiveHtmlResponse,
	renderToHydratableProgressiveHtmlResponse,
	renderToString,
	renderToStream
} from '@exactjs/ssr';
import { createExactServerDebugRuntime } from '@exactjs/server';
import { taskStatusJourney, taskCancellationJourney } from './task-status.mjs';
import { optimisticStateJourney } from './optimistic-state.mjs';
import { resourceDisposalJourney } from './resource-disposal.mjs';
import { requestOriginJourney } from './request-origin.mjs';
import { taskCallbackOwnershipJourney } from './task-callbacks.mjs';
import { streamCancellationJourney } from './stream-cancellation.mjs';
import { themeResolutionJourney } from './theme-resolution.mjs';
import { operationFixture } from './operations.mjs';
const PageScope = createContext('runtime.page', { scope: 'request', reactive: false });
/** One application contract across native hosts; only the adapter factory varies. */
export function createApplication({
	AsyncSsrScheduler,
	ssrPropAcceptanceApi,
	serverCancellationApi,
	normalizationComponents,
	taskCaptureResponse,
	valueContractsResponse,
	taskCaptureContexts,
	RuntimePage,
	RuntimeShell,
	eagerReplayResponse,
	childInputResponse,
	pendingOwnerResponse,
	RuntimeIsland,
	RuntimeViews,
	RuntimeScope,
	RuntimeDeadline,
	deadlineState,
	NativeProgress,
	runCount,
	createHandler,
	clientCode,
	control
}) {
	const contract = composeExactExecutorContract(
		[NativeProgress, RuntimePage, ...normalizationComponents],
		{
			endpoint: '/__exact'
		}
	);
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
		...taskCaptureContexts,
		'/__exact': { contract, logger },
		'/buffered': {
			contract: { ...contract, endpoint: '/buffered' },
			logger,
			contextRuntime: createExactContextRuntime(),
			progress: { supported: false, reason: 'test deployment buffers responses' }
		},
		'/operations': operations.context,
		'/debug-origin': {
			contract: {
				version: 1,
				endpoint: '/debug-origin',
				invocations: {},
				executors: {},
				boundaries: {}
			},
			publicOrigin: () => 'https://trusted.invalid',
			allowDebug: true,
			inspectionCatalogs: [
				{
					protocol: 1,
					buildKey: '0123456789abcdef0123456789abcdef01234567',
					producer: { packageName: 'runtime-acceptance' },
					roots: Object.fromEntries(
						['first', 'selected'].map((executionRoot) => [
							executionRoot,
							{
								executionRoot,
								rootComponentId: 'component:Panel',
								files: [
									{
										path: 'src/Panel.tsx',
										sourceHash: 'a'.repeat(64),
										components: [
											{
												id: 'component:Panel',
												kind: 'component',
												name: 'Panel',
												location: {
													path: 'src/Panel.tsx',
													sourceHash: 'a'.repeat(64),
													start: { offset: 0, line: 1, column: 1 },
													end: { offset: 10, line: 1, column: 11 }
												},
												classification: { kind: 'initializer' },
												reasons: [],
												children: []
											}
										]
									}
								],
								redactions: { statePaths: [], contextTokens: [], secretNames: [] }
							}
						])
					)
				}
			]
		}
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
			if (pathname.startsWith('/task-captures/'))
				return handlers[pathname]
					? handlers[pathname](request, env, ctx)
					: taskCaptureResponse(request, createHandler, env, ctx);
			if (pathname === '/component-child-inputs') return childInputResponse();
			if (pathname.startsWith('/value-contracts')) return valueContractsResponse(request);
			if (pathname.startsWith('/pending-owner')) return pendingOwnerResponse(request);
			if (pathname === '/task-cancellation') return Response.json(await taskCancellationJourney());
			if (pathname === '/resource-disposal') return Response.json(await resourceDisposalJourney());
			if (pathname === '/secret-resolver') return Response.json(await secretResolverJourney());
			if (pathname === '/cleanup-values') return Response.json(await cleanupValuesJourney());
			if (pathname === '/inspection-responses') return Response.json(inspectionResponseJourney());
			if (pathname === '/inspection-response-encoding') {
				await verifyInspectionResponseEncoding({
					createExactServerDebugRuntime,
					exactResponseToFetchResponse
				});
				return Response.json({ ok: true });
			}
			if (pathname === '/inspection-preview') {
				verifyInspectionQueryLimits(inspectionQueryLimitApi);
				return Response.json(inspectionPreviewJourney());
			}
			if (pathname === '/inspection-catalog')
				return Response.json(await inspectionCatalogJourney());
			if (pathname === '/plugin-output') return Response.json(await pluginOutputJourney());
			if (pathname === '/readiness-cleanup') return Response.json(await readinessCleanupJourney());
			if (pathname === '/request-origin') return Response.json(await requestOriginJourney());
			if (pathname === '/task-callbacks')
				return Response.json(await taskCallbackOwnershipJourney());
			if (pathname === '/stream-cancellation')
				return Response.json(await streamCancellationJourney());
			if (pathname === '/optimistic-state') return Response.json(await optimisticStateJourney());
			if (pathname === '/theme-resolution') return Response.json(await themeResolutionJourney());
			if (pathname === '/enhancement-publication') {
				const props = { value: 'provider', probe: () => undefined };
				const target = createCompiledIntrinsicReceipt(
					'button',
					{
						__exactEnhancements: createEnhancementNode([{ identity: 'runtime-scope', props }])
					},
					'Ready'
				);
				const options = {
					markers: false,
					enhancementCatalog: new Map([['runtime-scope', RuntimeScope]])
				};
				const buffered = (await renderToString(target, options)).html;
				const streamed = await new Response(renderToStream(target, options)).text();
				let ordinaryRejected = false;
				try {
					await renderToString(
						receipt(RuntimeShell, {
							unavailable: false,
							children: receipt(RuntimeScope, props, { kind: 'eager', values: [target] })
						}),
						{
							...options,
							clientResumptionOwner: false
						}
					);
				} catch (error) {
					if (!error.message.includes('props must be JSON-serializable')) throw error;
					ordinaryRejected = true;
				}
				return Response.json({
					buffered,
					streamed,
					ordinaryRejected,
					publication: componentInputRecipe(
						redeemComponentInput(receipt(RuntimeScope, props), { version: 6, target: 'server' }),
						{ version: 6, target: 'server' }
					).contract.artifact.execution.publication
				});
			}
			if (pathname === '/url-coercion') return Response.json(await urlCoercionJourney());
			if (pathname === '/router-navigation') {
				await verifyFetcherDataTargets(routerNavigationApi);
				await verifyNavigationAbortOwnership(routerNavigationApi);
				await verifyRevalidationAbortOwnership(routerNavigationApi);
				await verifyHandlerRequestSignals(routerNavigationApi);
				await verifyCallerRequestCancellation(routerNavigationApi);
				await verifyDelegatedRequestCancellation(routerNavigationApi);
				verifyRouteMatching(routerNavigationApi);
				verifyCompatibilityBasenames({ matchRoutes: matchCompatibilityRoutes });
				await verifyRouteMatchingTransitions(routerNavigationApi);
				await verifyRouteRecords({ ...routerNavigationApi, createStaticHandler });
				await verifyDataActionTargets(routerNavigationApi);
				await verifyFetcherPublication(routerNavigationApi);
				await verifyFetcherAbortReplacement(routerNavigationApi);
				await verifyFetcherPublicationFailure(routerNavigationApi);
				await verifyRouterRedirectFailures(routerNavigationApi);
				await verifyRouterPublicationData(routerNavigationApi);
				await verifyRouterFailureOwnership(routerNavigationApi);
				return Response.json({ ok: true });
			}
			if (pathname === '/static-router-queries') {
				await verifyStaticQueryCancellation({ createStaticHandler });
				await verifyStaticRequestDetails({ createStaticHandler });
				await verifySingleRouteQueries({ createStaticHandler });
				await verifyStaticRouterQueries({ createStaticHandler });
				return Response.json({ ok: true });
			}
			if (pathname === '/marker-keys' || pathname === '/nested-marker-keys') {
				verifyMarkerEncoding(markerProtocolApi);
				return Response.json(
					await markerKeySnapshots(
						{
							renderKeyedListSnapshot,
							parseKeyedListSnapshotHtml,
							diffKeyedListItems,
							createCompiledKeyedChildReceipt
						},
						pathname === '/nested-marker-keys'
					)
				);
			}
			if (pathname === '/react-child-arrays') {
				await verifySsrPropCancellation(ssrPropAcceptanceApi);
				await verifySsrPropPreparationCleanup(ssrPropAcceptanceApi);
				await verifyProgressiveUnwindCancellation(ssrPropAcceptanceApi);
				await verifyExpressCancellation(() =>
					createExpressHandler({
						contract: {
							version: 1,
							invocations: { probe: defineExactOperationContract('probe') },
							boundaries: {}
						},
						invocations: { probe: async () => ({}) },
						logger: { log() {} }
					})
				);
				verifyRequestRedirectTransaction({ createRequestContextValue, commitRequestResponseState });
				await verifyServerStreamCancellation(serverCancellationApi);
				await verifyTaskProgressCancellation(serverCancellationApi);
				await verifyTaskFrameCancellation(serverCancellationApi);
				await verifyProducedResponseCancellation({
					createExactProducedResponse,
					createExactAsyncProducedResponse
				});
				await verifyServerContextCancellation({
					createExactContextRuntime,
					runWithExactRequestScope
				});
				await verifySsrSchedulerGrant(AsyncSsrScheduler);
				await verifySsrCancellationReasons({
					renderToStream,
					renderToProgressiveHtmlStream,
					renderToDocumentStream
				});
				const html = await verifyReactChildArrayServer({
					...reactChildArrayApi,
					...reactChildArrayServer,
					toReactNode: projectReactChildren
				});
				return Response.json({ html });
			}
			if (pathname === '/hydration-records') {
				await verifyIslandPublicationBudget({
					...reactiveProtocolApi,
					renderToString,
					createServerBoundary
				});
				const script = createHydrationRecordScript({
					...reactiveProtocolApi,
					renderHydrationScript
				});
				return Response.json({ script });
			}
			if (pathname === '/reactive-protocol') {
				verifyReactiveProtocolCollections({
					...reactiveProtocolApi,
					encodeValidatedReactiveCollection
				});
				return Response.json({ ok: true });
			}
			if (pathname === '/serialization-safety') return Response.json(serializationSafety());
			if (pathname === '/hydration-escaping') {
				const values = [
					'',
					'plain',
					'</script>',
					'<!--<script>',
					'plain\u2028\u2029',
					'\u2029<\u2028',
					'caf\u00e9 \ud83d\ude80 \ud800',
					'x<\u2028\u2029'.repeat(1000)
				];
				return Response.json(
					[...values, ...values.toReversed()].map((value) => ({
						value,
						script: renderHydrationScript({ state: { [value]: value } })
					}))
				);
			}
			if (pathname === '/task-status') return Response.json(await taskStatusJourney());
			if (pathname === '/deadline-state') return Response.json(deadlineState());
			if (pathname === '/limited-page') {
				const id = new URL(request.url).searchParams.get('gate');
				try {
					return exactResponseToFetchResponse(
						await renderExactRequestToHtmlResponse(
							request,
							pageContext,
							() => receipt(RuntimeDeadline, { id }),
							{ hydration: false, signal: AbortSignal.timeout(150) }
						)
					);
				} catch (error) {
					if (error.name !== 'TimeoutError')
						return Response.json({ error: error.name, message: error.message }, { status: 500 });
					return Response.json({ error: error.name }, { status: 504 });
				}
			}
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
			if (pathname.startsWith('/eager-')) return eagerReplayResponse(request);
			if (pathname.startsWith('/bootstrap-')) return bootstrapLoadingResponse(request);
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
										unavailable: createExpression(() => false),
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
											unavailable: createExpression(() => false),
											children: application,
											gate: new URL(request.url).searchParams.has('gate')
												? control + '/gate?id=' + new URL(request.url).searchParams.get('gate')
												: undefined
										}),
							enhancementCatalog: new Map([
								...exactEnhancementCatalog,
								['runtime-scope', RuntimeScope],
								['runtime-scope-peer', RuntimeScope]
							]),
							...createExactHydrationConfig(contract),
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
