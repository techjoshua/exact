import { describe, expect, it, vi } from 'vitest';
import { createExactBindingGateway, handleExactRequest } from './index.js';
import { context } from './test-support/server.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';

describe('page host to component host integration', () => {
	it('routes secured requests to two private hosts and dispatches colliding local ids by root', async () => {
		const pageAuthorize = vi.fn(() => true);
		const billingAuthorize = vi.fn(
			(request) =>
				new Headers(request.headers as HeadersInit).get('authorization') === 'Bearer component-host'
		);
		const brandingAuthorize = vi.fn(
			(request) =>
				new Headers(request.headers as HeadersInit).get('authorization') === 'Bearer component-host'
		);
		const areaAction = vi.fn(() => ({ state: { source: 'area' } }));
		const otherAction = vi.fn(() => ({ state: { source: 'other' } }));
		const shellAction = vi.fn(() => ({ state: { source: 'branding' } }));
		const billingContext = context({
			authorize: billingAuthorize,
			remoteBuilds: {
				[buildKey]: {
					buildKey,
					roots: {
						'@company/billing#./Area': {
							manifest: actionManifest('same-local-id'),
							actions: { 'same-local-id': areaAction }
						},
						'@company/billing#./Other': {
							manifest: actionManifest('same-local-id'),
							actions: { 'same-local-id': otherAction }
						}
					}
				}
			}
		});
		const brandingContext = context({
			authorize: brandingAuthorize,
			remoteBuilds: {
				[buildKey]: {
					buildKey,
					roots: {
						'@company/branding#./Shell': {
							manifest: actionManifest('same-local-id'),
							actions: { 'same-local-id': shellAction }
						}
					}
				}
			}
		});
		const componentFetch = vi.fn(
			async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
				const endpoint = String(input);
				const hostContext = endpoint.startsWith('http://billing.internal/')
					? billingContext
					: endpoint.startsWith('http://branding.internal/')
						? brandingContext
						: undefined;
				if (!hostContext) throw new Error(`Unexpected private endpoint: ${endpoint}`);
				const response = await handleExactRequest(
					{
						method: init?.method ?? 'GET',
						url: String(input),
						headers: new Headers(init?.headers),
						body: JSON.parse(String(init?.body)),
						signal: init?.signal ?? undefined
					},
					hostContext
				);
				return new Response(response.stream ?? response.body, {
					status: response.status,
					headers: response.headers
				});
			}
		);
		const pageContext = context({
			authorize: pageAuthorize,
			gateway: createExactBindingGateway({
				bindings: {
					billing: { endpoint: 'http://billing.internal/__exact' },
					branding: { endpoint: 'http://branding.internal/__exact' }
				},
				fetch: componentFetch as typeof fetch,
				transformForwardedRequest(request) {
					const headers = new Headers(request.headers as HeadersInit);
					headers.set('authorization', 'Bearer component-host');
					return { ...request, headers };
				}
			})
		});

		const billingResponse = await handleExactRequest(
			{
				method: 'POST',
				url: 'https://page.example.test/__exact',
				headers: {
					'x-exact-binding': 'billing',
					'x-exact-build': buildKey,
					authorization: 'Bearer browser'
				},
				body: {
					type: 'batch',
					version: 1,
					operations: [
						{
							type: 'action',
							root: '@company/billing#./Area',
							id: 'same-local-id'
						},
						{
							type: 'action',
							root: '@company/billing#./Other',
							id: 'same-local-id'
						}
					]
				}
			},
			pageContext
		);

		const brandingResponse = await handleExactRequest(
			{
				method: 'POST',
				url: 'https://page.example.test/__exact',
				headers: {
					'x-exact-binding': 'branding',
					'x-exact-build': buildKey,
					authorization: 'Bearer browser'
				},
				body: {
					type: 'action',
					root: '@company/branding#./Shell',
					id: 'same-local-id'
				}
			},
			pageContext
		);

		expect(billingResponse.status).toBe(200);
		expect(JSON.parse(billingResponse.body).results).toEqual([
			expect.objectContaining({ ok: true, state: { source: 'area' } }),
			expect.objectContaining({ ok: true, state: { source: 'other' } })
		]);
		expect(brandingResponse.status).toBe(200);
		expect(JSON.parse(brandingResponse.body)).toEqual(
			expect.objectContaining({ ok: true, state: { source: 'branding' } })
		);
		expect(pageAuthorize).toHaveBeenCalledTimes(2);
		expect(billingAuthorize).toHaveBeenCalledOnce();
		expect(brandingAuthorize).toHaveBeenCalledOnce();
		expect(areaAction).toHaveBeenCalledOnce();
		expect(otherAction).toHaveBeenCalledOnce();
		expect(shellAction).toHaveBeenCalledOnce();
		expect(componentFetch).toHaveBeenCalledTimes(2);
		expect(componentFetch.mock.calls.map(([input]) => String(input))).toEqual([
			'http://billing.internal/__exact',
			'http://branding.internal/__exact'
		]);
		for (const forwarded of componentFetch.mock.calls) {
			const forwardedHeaders = new Headers(forwarded[1]?.headers);
			expect(forwardedHeaders.get('x-exact-binding')).toBeNull();
			expect(forwardedHeaders.get('x-exact-build')).toBe(buildKey);
		}
		expect(billingResponse.body).not.toContain('.internal');
		expect(brandingResponse.body).not.toContain('.internal');
	});
});

function actionManifest(id: string) {
	return {
		version: 1 as const,
		actions: {
			[id]: {
				id,
				placement: 'server' as const,
				stateContract: {
					writes: [{ path: '*', kind: 'write' as const, confidence: 'exact' as const }]
				}
			}
		},
		boundaries: {}
	};
}
