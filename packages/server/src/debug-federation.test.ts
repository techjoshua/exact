/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
import type { ExactBuildInspectionCatalog } from '@exactjs/devtools-protocol';
import { describe, expect, it, vi } from 'vitest';
import {
	createExactBindingGateway,
	defineExactOperationContract,
	exactServerDebugRuntime,
	handleExactRequest
} from './index.js';
import type { ExactRequestLike, ExactResponseLike, ExactServerContext } from './types.js';

const brandingBuild = '1'.repeat(40);
const billingBuild = '2'.repeat(40);

describe('federated server inspection', () => {
	it('authorizes both hosts, translates child sessions, and keeps builds and roots distinct', async () => {
		const remoteCloses: string[] = [];
		const forwardedHeaders: Headers[] = [];
		const branding = host('branding', brandingBuild);
		const billing = host('billing', billingBuild);
		const remoteFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const endpoint = String(input);
			const headers = new Headers(init?.headers);
			forwardedHeaders.push(headers);
			const request: ExactRequestLike = {
				method: String(init?.method ?? 'POST'),
				url: endpoint,
				headers,
				body: init?.body
			};
			const context = endpoint.includes('branding') ? branding : billing;
			const body = JSON.parse(String(init?.body));
			if (body.request === 'close') remoteCloses.push(endpoint);
			return toResponse(await handleExactRequest(request, context));
		});
		const gateway = createExactBindingGateway({
			bindings: {
				branding: {
					endpoint: 'https://branding.internal/__exact',
					debugBuilds: { [brandingBuild]: ['@company/branding#./Shell'] }
				},
				billing: {
					endpoint: 'https://billing.internal/__exact',
					debugBuilds: { [billingBuild]: ['@company/billing#./Area'] }
				}
			},
			fetch: remoteFetch,
			transformForwardedRequest(request) {
				return {
					...request,
					headers: new Headers({
						...Object.fromEntries(new Headers(request.headers as HeadersInit)),
						'x-service-auth': 'trusted-page-host'
					})
				};
			}
		});
		const page = host('page', '0'.repeat(40), {
			gateway,
			allowDebug: true
		});
		const opened = await handleExactRequest(debugOpen(), page);
		const parentSessionId = json(opened).session.id as string;
		const brand = await handleExactRequest(
			federatedQuery(parentSessionId, 'branding', brandingBuild, '@company/branding#./Shell'),
			page
		);
		const bill = await handleExactRequest(
			federatedQuery(parentSessionId, 'billing', billingBuild, '@company/billing#./Area'),
			page
		);

		expect(json(brand).result).toMatchObject({ name: 'SharedLocalName' });
		expect(json(bill).result).toMatchObject({ name: 'SharedLocalName' });
		expect(json(brand).identity.sessionId).toBe(parentSessionId);
		expect(json(bill).identity.sessionId).toBe(parentSessionId);
		expect(json(brand).identity.buildKey).toBe(brandingBuild);
		expect(json(bill).identity.buildKey).toBe(billingBuild);
		expect(forwardedHeaders.every((headers) => !headers.has('cookie'))).toBe(true);
		expect(forwardedHeaders.every((headers) => !headers.has('authorization'))).toBe(true);
		expect(forwardedHeaders.every((headers) => !headers.has('origin'))).toBe(true);

		const observed = await handleExactRequest(
			{
				method: 'POST',
				url: '/__exact',
				headers: {
					'x-exact-binding': 'branding',
					'x-exact-build': brandingBuild,
					'x-exact-debug-session': parentSessionId
				},
				body: {
					type: 'invoke',
					root: '@company/branding#./Shell',
					id: 'observe'
				}
			},
			page
		);
		expect(observed.status, observed.body).toBe(200);
		expect(forwardedHeaders.some((headers) => headers.has('x-exact-debug-session'))).toBe(true);
		expect(json(observed)).toHaveProperty('__exactObservations');
		const observedEvent = (json(observed).__exactObservations as Array<{ id: unknown }>)[0]!;
		expect(observedEvent.id).toMatchObject({
			sessionId: parentSessionId,
			binding: 'branding',
			buildKey: brandingBuild,
			executionRoot: '@company/branding#./Shell'
		});

		await exactServerDebugRuntime(page).close();
		// The branding catalog-only child is rotated once to add request-observation authority,
		// then both active child sessions close when the parent runtime closes all sessions.
		expect(remoteCloses).toHaveLength(3);
	});

	it('requires independent remote authorization and registered binding/build/root routing', async () => {
		const remote = host('branding', brandingBuild, { allowDebug: false });
		const fetch = async (_input: string | URL | Request, init?: RequestInit) =>
			toResponse(
				await handleExactRequest(
					{
						method: 'POST',
						url: 'https://branding.internal/__exact',
						headers: new Headers(init?.headers),
						body: init?.body
					},
					remote
				)
			);
		const page = host('page', '0'.repeat(40), {
			allowDebug: true,
			gateway: createExactBindingGateway({
				bindings: {
					branding: {
						endpoint: 'https://branding.internal/__exact',
						debugBuilds: { [brandingBuild]: ['@company/branding#./Shell'] }
					}
				},
				fetch
			})
		});
		const opened = await handleExactRequest(debugOpen(), page);
		const sessionId = json(opened).session.id as string;
		const denied = await handleExactRequest(
			federatedQuery(sessionId, 'branding', brandingBuild, '@company/branding#./Shell'),
			page
		);
		const wrongRoot = await handleExactRequest(
			federatedQuery(sessionId, 'branding', brandingBuild, '@company/branding#./Other'),
			page
		);
		expect(denied.status).toBe(404);
		expect(wrongRoot.status).toBe(404);
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
		body: {
			type: 'debug',
			version: 1,
			request: 'open',
			capabilities: ['catalog', 'events']
		}
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
			'x-exact-build': buildKey,
			cookie: 'browser=session',
			authorization: 'Bearer browser',
			origin: 'https://page.test'
		},
		body: {
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
		}
	};
}

function toResponse(response: ExactResponseLike): Response {
	return new Response(response.stream ?? response.body, {
		status: response.status,
		headers: response.headers
	});
}

function json(response: ExactResponseLike): any {
	return JSON.parse(response.body);
}
