import type { ExactBuildInspectionCatalog } from '@exactjs/devtools-protocol';
import { describe, expect, it, vi } from 'vitest';
import {
	createExactBindingGateway,
	defineExactOperationContract,
	exactServerDebugRuntime,
	exactResponseToFetchResponse,
	handleExactRequest
} from './index.js';
import type { ExactRequestLike, ExactServerContext } from './types.js';
const brandingBuild = '1'.repeat(40);

describe('independent service inspection', () => {
	it('preserves correlation and lets each service authorize every request', async () => {
		let serviceAllowed = true;
		const serviceAuth = vi.fn(() => serviceAllowed);
		const service = host('branding', brandingBuild, {
			publicOrigin: 'https://page.test',
			authorize: serviceAuth
		});
		const forwarded: ExactRequestLike[] = [];
		const remoteFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			const request = {
				method: 'POST',
				url: 'https://branding.internal/__exact',
				headers: new Headers(init?.headers),
				body: init?.body
			};
			forwarded.push(request);
			return exactResponseToFetchResponse(await handleExactRequest(request, service));
		});
		let pageAllowed = true;
		const page = host('page', '0'.repeat(40), {
			authorize: () => pageAllowed,
			gateway: createExactBindingGateway({
				bindings: { branding: { endpoint: 'https://branding.internal/__exact' } },
				fetch: remoteFetch
			})
		});
		try {
			const opened = await exactResponseToFetchResponse(
				await handleExactRequest(debugOpen(), page)
			).json();
			const sessionId = opened.session.id as string;
			const request = federatedQuery(
				sessionId,
				'branding',
				brandingBuild,
				'@company/branding#./Shell'
			);
			const response = await handleExactRequest(request, page);
			expect(response.status).toBe(200);
			const result = await exactResponseToFetchResponse(response).json();
			expect(result.result).toMatchObject({ name: 'SharedLocalName' });
			expect(result.identity).toMatchObject({
				sessionId,
				binding: 'branding',
				buildKey: brandingBuild
			});
			expect(remoteFetch).toHaveBeenCalledOnce();
			expect(forwarded[0]!.body).toBe(request.body);
			expect(new Headers(forwarded[0]!.headers as HeadersInit).get('cookie')).toBe(
				'browser=session'
			);
			expect(new Headers(forwarded[0]!.headers as HeadersInit).get('x-exact-debug-session')).toBe(
				sessionId
			);
			const observed = await exactResponseToFetchResponse(
				await handleExactRequest(
					{
						...request,
						body: JSON.stringify({
							type: 'invoke',
							root: '@company/branding#./Shell',
							id: 'observe'
						})
					},
					page
				)
			).json();
			expect(observed.__exactObservations.length).toBeGreaterThan(0);
			expect(
				observed.__exactObservations.every(
					(event: { id: { sessionId: string; binding: string } }) =>
						event.id.sessionId === sessionId && event.id.binding === 'branding'
				)
			).toBe(true);

			serviceAllowed = false;
			expect((await handleExactRequest(request, page)).status).toBe(403);
			expect(serviceAuth).toHaveBeenCalledTimes(3);
			pageAllowed = false;
			expect((await handleExactRequest(request, page)).status).toBe(403);
			expect(remoteFetch).toHaveBeenCalledTimes(3);
			pageAllowed = true;
			await handleExactRequest(
				{ method: 'POST', body: { type: 'debug', version: 1, request: 'close', sessionId } },
				page
			);
			expect(remoteFetch).toHaveBeenCalledTimes(3);
		} finally {
			exactServerDebugRuntime(page).close();
			exactServerDebugRuntime(service).close();
		}
	});
});

function host(
	name: string,
	buildKey: string,
	overrides: Partial<ExactServerContext> = {}
): ExactServerContext {
	const root =
		name === 'branding'
			? '@company/branding#./Shell'
			: name === 'billing'
				? '@company/billing#./Area'
				: 'page';
	return {
		contract: {
			version: 1,
			endpoint: '/__exact',
			invocations: { observe: defineExactOperationContract('observe') },
			executors: {},
			boundaries: {}
		},
		allowDebug: true,
		invocations: { observe: () => ({}) },
		inspectionCatalogs: [catalog(buildKey, root)],
		...overrides
	};
}

function catalog(buildKey: string, executionRoot: string): ExactBuildInspectionCatalog {
	const sourceHash = buildKey.padEnd(64, 'a');
	return {
		protocol: 1,
		buildKey,
		producer: {},
		roots: {
			[executionRoot]: {
				executionRoot,
				rootComponentId: 'component:Shared',
				files: [
					{
						path: 'src/Shared.tsx',
						sourceHash,
						components: [
							{
								id: 'component:Shared',
								kind: 'component',
								name: 'SharedLocalName',
								location: {
									path: 'src/Shared.tsx',
									sourceHash,
									start: { offset: 0, line: 1, column: 1 },
									end: { offset: 1, line: 1, column: 2 }
								},
								reasons: [],
								children: []
							}
						]
					}
				],
				redactions: { statePaths: [], contextTokens: [], secretNames: [] }
			}
		}
	};
}

function debugOpen(): ExactRequestLike {
	return {
		method: 'POST',
		url: '/__exact',
		body: JSON.stringify({
			type: 'debug',
			version: 1,
			request: 'open',
			capabilities: ['catalog', 'events']
		})
	};
}

function federatedQuery(
	sessionId: string,
	binding: string,
	buildKey: string,
	executionRoot: string
): ExactRequestLike {
	return {
		method: 'POST',
		url: '/__exact',
		headers: {
			'x-exact-binding': binding,
			'x-exact-debug-session': sessionId,
			'x-exact-build': buildKey,
			cookie: 'browser=session',
			authorization: 'Bearer browser',
			origin: 'https://page.test'
		},
		body: JSON.stringify({
			type: 'debug',
			version: 1,
			request: 'query',
			sessionId,
			query: {
				protocol: 1,
				id: `catalog-${binding}`,
				method: 'catalog.entity',
				params: {
					identity: {
						sessionId,
						side: 'server',
						binding,
						buildKey,
						executionRoot,
						componentTypeId: 'component:Shared'
					},
					sourceEntityId: 'component:Shared'
				}
			}
		})
	};
}
