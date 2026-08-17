import { createExactBindingGateway } from '@exactjs/microfrontends';
import { createVNode } from '@exactjs/core';
import { renderToStringAsync } from '@exactjs/ssr';
import type {
	ExactGatewayRejectEvent,
	ExactInvocationRequest,
	ExactRemoteBuildRegistration,
	ExactRequestLike,
	ExactServerContext,
	ExactExecutorContract
} from '@exactjs/server';
import {
	defineExactBoundaryContract,
	defineExactOperationContract,
	unsafeExactHtml
} from '@exactjs/server';

/** Immutable protocol root for the billing exposure. */
export const billingRoot = '@exactjs/sample-microfrontend-billing#./Billing';
/** Immutable protocol root for the full branding exposure. */
export const brandingRoot = '@exactjs/sample-microfrontend-branding#./Shell';
/** Immutable protocol root for the compact branding exposure. */
export const compactBrandingRoot = '@exactjs/sample-microfrontend-branding#./CompactShell';

/** Configures build identity, private endpoints, and transport for the sample topology. */
export type SampleRuntimeOptions = {
	buildKey: string;
	billingEndpoint?: string;
	brandingEndpoint?: string;
	fetch?: typeof fetch;
};

/** Exposes the three server contexts and observable execution counters used by tests. */
export type SampleRuntimeSet = {
	page: ExactServerContext;
	billing: ExactServerContext;
	branding: ExactServerContext;
	observations: {
		gatewayRejects: ExactGatewayRejectEvent[];
		pageExecutions: number;
		billingExecutions: number;
		brandingExecutions: number;
		pageServerRenders: number;
		billingServerRenders: number;
		brandingServerRenders: number;
	};
};

/** Creates the public page runtime and both independently authorized component runtimes. */
export function createSampleRuntimes(options: SampleRuntimeOptions): SampleRuntimeSet {
	if (!/^[0-9a-f]{40}$/i.test(options.buildKey))
		throw new Error('The sample requires a full Git SHA build key');
	const observations = {
		gatewayRejects: [] as ExactGatewayRejectEvent[],
		pageExecutions: 0,
		billingExecutions: 0,
		brandingExecutions: 0,
		pageServerRenders: 0,
		billingServerRenders: 0,
		brandingServerRenders: 0
	};

	const billing = componentRuntime(
		options.buildKey,
		{
			[billingRoot]: rootRegistration(
				['billing.balance', 'billing.history'],
				{
					'billing.balance': (input) => {
						observations.billingExecutions++;
						return {
							state: {
								source: 'billing-host',
								accountId: account(input),
								message: `Server balance for ${account(input)}: $1,284.32`
							}
						};
					},
					'billing.history': (input) => {
						observations.billingExecutions++;
						return {
							state: {
								source: 'billing-host',
								message: `Server history for ${account(input)}: 3 invoices`
							}
						};
					}
				},
				{
					'billing.summary': async (input) => {
						observations.billingServerRenders++;
						return { html: await serverComponentHtml('Billing server component', input) };
					}
				}
			)
		},
		internalAuthorization
	);

	const branding = componentRuntime(
		options.buildKey,
		{
			[brandingRoot]: rootRegistration(
				['branding.ping'],
				{
					'branding.ping': (input) => brandingPing(input, 'full', observations)
				},
				{
					'branding.summary': async (input) => {
						observations.brandingServerRenders++;
						return { html: await serverComponentHtml('Branding server component', input) };
					}
				}
			),
			[compactBrandingRoot]: rootRegistration(
				['branding.ping'],
				{
					'branding.ping': (input) => brandingPing(input, 'compact', observations)
				},
				{
					'branding.summary': async (input) => {
						observations.brandingServerRenders++;
						return { html: await serverComponentHtml('Compact branding server component', input) };
					}
				}
			)
		},
		internalAuthorization
	);

	const pageContract = actionContract(['page.audit'], ['page.summary']);
	const page: ExactServerContext = {
		contract: pageContract,
		invocations: {
			'page.audit': (input) => {
				observations.pageExecutions++;
				const payload = payloadRecord(input);
				return {
					state: {
						source: 'page-host',
						message: `Page server audited ${String(payload.tenant)} / ${String(payload.accountId)}`
					}
				};
			}
		},
		payloadDecoders: {
			invocations: { 'page.audit': decodePayloadRecord },
			boundaries: { 'page.summary': decodePayloadRecord }
		},
		refreshBoundaries: {
			'page.summary': async (input) => {
				observations.pageServerRenders++;
				return { html: await serverComponentHtml('Page server component', input) };
			}
		},
		authorize: () => true,
		gateway: createExactBindingGateway({
			bindings: {
				billing: {
					endpoint: options.billingEndpoint ?? 'http://localhost:4401/__exact'
				},
				branding: {
					endpoint: options.brandingEndpoint ?? 'http://localhost:4402/__exact'
				},
				compactBranding: {
					endpoint: options.brandingEndpoint ?? 'http://localhost:4402/__exact'
				}
			},
			fetch: options.fetch,
			transformForwardedRequest(request) {
				const headers = new Headers(request.headers as HeadersInit);
				headers.set('authorization', 'Bearer exact-sample-internal');
				headers.set('x-exact-forwarded-by', 'microfrontend-page');
				return { ...request, headers };
			},
			onReject(event) {
				observations.gatewayRejects.push(event);
			}
		})
	};

	return { page, billing, branding, observations };
}

function componentRuntime(
	buildKey: string,
	roots: ExactRemoteBuildRegistration['roots'],
	authorize: NonNullable<ExactServerContext['authorize']>
): ExactServerContext {
	return {
		contract: actionContract([]),
		remoteBuilds: {
			[buildKey]: { buildKey, roots }
		},
		authorize
	};
}

function rootRegistration(
	ids: readonly string[],
	invocations: NonNullable<ExactServerContext['invocations']>,
	refreshBoundaries: NonNullable<ExactServerContext['refreshBoundaries']> = {}
): ExactRemoteBuildRegistration['roots'][string] {
	return {
		contract: actionContract(ids, Object.keys(refreshBoundaries)),
		invocations,
		refreshBoundaries,
		payloadDecoders: {
			invocations: Object.fromEntries(ids.map((id) => [id, decodePayloadRecord])),
			boundaries: Object.fromEntries(
				Object.keys(refreshBoundaries).map((id) => [id, decodePayloadRecord])
			)
		}
	};
}

function decodePayloadRecord(payload: unknown): Record<string, unknown> {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload))
		throw new TypeError('Expected an object payload');
	return payload as Record<string, unknown>;
}

function actionContract(
	ids: readonly string[],
	boundaries: readonly string[] = []
): ExactExecutorContract {
	return {
		version: 1,
		endpoint: '/__exact',
		invocations: Object.fromEntries(
			ids.map((id) => [
				id,
				defineExactOperationContract(id, {
					writes: [{ path: '*', kind: 'write', confidence: 'exact' }],
					boundaries
				})
			])
		),
		boundaries: Object.fromEntries(boundaries.map((id) => [id, defineExactBoundaryContract(id)]))
	};
}

function internalAuthorization(request: ExactRequestLike) {
	const headers = new Headers(request.headers as HeadersInit);
	return (
		headers.get('authorization') === 'Bearer exact-sample-internal' &&
		headers.get('x-exact-forwarded-by') === 'microfrontend-page'
	);
}

function brandingPing(
	input: ExactInvocationRequest,
	variant: string,
	observations: SampleRuntimeSet['observations']
) {
	observations.brandingExecutions++;
	const requested = String(payloadRecord(input).variant ?? variant);
	return {
		state: {
			source: 'branding-host',
			variant,
			message: `Branding server (${requested}) answered from its private host`
		}
	};
}

function payloadRecord(input: ExactInvocationRequest): Record<string, unknown> {
	return input.payload && typeof input.payload === 'object'
		? (input.payload as Record<string, unknown>)
		: {};
}

function account(input: ExactInvocationRequest): string {
	return String(payloadRecord(input).accountId ?? 'unknown account');
}

async function serverComponentHtml(label: string, input: ExactInvocationRequest): Promise<string> {
	const rendered = await renderToStringAsync(
		createVNode(
			'article',
			{ 'data-server-component': label },
			`${label}: ${String(payloadRecord(input).tenant ?? 'unknown tenant')} / ${account(input)}`
		),
		{ markers: false }
	);
	return unsafeExactHtml(rendered.html);
}
