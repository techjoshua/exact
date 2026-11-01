import {
	exactResponseToFetchResponse,
	defineExactBoundaryContract,
	defineExactOperationContract,
	exactResponseBodyOf,
	handleExactRequest
} from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import {
	createExactServerRuntime,
	renderExactRequestToHtmlResponse,
	renderExactRequestToProgressiveHtmlResponse
} from './index.js';
import {
	ApplicationName,
	readActiveRequest,
	RedirectRequestPage,
	RefreshProfile,
	RequestContextPage,
	RequestName,
	resetActiveRequest,
	SettledRequestPage
} from './request-context.fixtures.test.js';
import { createOperation } from './test-support/native-operations.js';

describe('@exactjs/ssr request-context', () => {
	it.each([false, true])(
		'preserves fragment and document assembly with hydration %s',
		async (hydration) => {
			const runtime = createExactServerRuntime({
				contract: { version: 1, invocations: {}, boundaries: {} }
			});
			try {
				for (const progressive of [false, true]) {
					for (const document of [false, true]) {
						const render = progressive
							? renderExactRequestToProgressiveHtmlResponse
							: renderExactRequestToHtmlResponse;
						const content = createOperation('main', null, 'Ready');
						const response = await render(
							{ method: 'GET', url: 'https://example.test/' },
							runtime,
							() =>
								document
									? createOperation(
											'html',
											null,
											createOperation('head', null),
											createOperation('body', null, content)
										)
									: content,
							{
								hydration,
								markers: false,
								rootId: 'a"b',
								status: 202,
								headers: { 'x-custom': 'kept' }
							}
						);
						const html = await exactResponseToFetchResponse(response).text();
						expect(response.status).toBe(202);
						expect(response.headers['x-custom']).toBe('kept');
						expect(html).toContain('<main>Ready</main>');
						if (document) {
							expect(html.startsWith('<!doctype html><html>')).toBe(true);
							expect(html).not.toContain('<div id=');
						} else if (progressive) {
							expect(html.startsWith('<div id="a&quot;b"><main>Ready</main></div>')).toBe(true);
						} else {
							expect(html.startsWith('<main>Ready</main>')).toBe(true);
						}
						expect(html.includes('<script')).toBe(hydration);
					}
				}
			} finally {
				await runtime.dispose?.();
			}
		}
	);

	it.each([
		['ordinary', renderExactRequestToHtmlResponse],
		['progressive', renderExactRequestToProgressiveHtmlResponse]
	] as const)(
		'releases %s request resources after render failures and permits the next request',
		async (_name, render) => {
			const disposed: string[] = [];
			const runtime = createExactServerRuntime({
				contract: { version: 1, invocations: {}, boundaries: {} },
				requestContexts: [
					[
						RequestName,
						{
							create: (scope) => scope.request!.url.pathname,
							dispose: (value) => {
								disposed.push(value);
							}
						}
					]
				]
			});
			try {
				await expect(
					render(
						{ method: 'GET', url: 'https://example.test/callback' },
						runtime,
						() => {
							throw null;
						},
						{ hydration: false }
					)
				).rejects.toBe(null);
				expect(disposed).toEqual(['/callback']);
				await expect(
					render(
						{ method: 'GET', url: 'https://example.test/output' },
						runtime,
						() => createOperation('main', null, 'Too large'),
						{ hydration: false, maxOutputBytes: 1 }
					)
				).rejects.toThrow(/maximum.*bytes/);
				expect(disposed).toEqual(['/callback', '/output']);
				const response = await render(
					{ method: 'GET', url: 'https://example.test/next' },
					runtime,
					(context) => createOperation('main', null, context.contexts!.getSync(RequestName)),
					{ hydration: false }
				);
				expect(disposed).toEqual(['/callback', '/output', '/next']);
				expect(await exactResponseToFetchResponse(response).text()).toContain('<main>/next</main>');
			} finally {
				await runtime.dispose?.();
			}
		}
	);

	it('constructs the root only after contexts initialize and stabilizes task-written output', async () => {
		const runtime = createExactServerRuntime({
			contract: { version: 1, invocations: {}, boundaries: {} },
			applicationContexts: [[ApplicationName, { value: 'app' }]],
			requestContexts: [
				[
					RequestName,
					{
						async create(scope) {
							const application = await scope.get(ApplicationName);
							return `${application}:${scope.request!.url.pathname}`;
						}
					}
				]
			]
		});

		const response = await renderExactRequestToHtmlResponse(
			{
				method: 'GET',
				url: 'https://example.test/account'
			},
			runtime,
			() => createOperation(RequestContextPage, {}),
			{
				hydration: false,
				markers: false
			}
		);

		expect(response.status).toBe(201);
		expect(response.headers['x-rendered']).toBe('yes');
		const chunks: string[] = [];
		await exactResponseBodyOf(response)?.writeTo((chunk) => {
			chunks.push(chunk);
		});
		expect(chunks.join('')).toBe('<p>app:/account:GET</p>');
		await runtime.dispose?.();
	});

	it('projects the trusted public origin through the high-level runtime', async () => {
		const runtime = createExactServerRuntime({
			contract: { version: 1, invocations: {}, boundaries: {} },
			publicOrigin: 'https://public.example.test'
		});
		let requestUrl: URL | undefined;
		let publicOrigin: URL | undefined;

		const response = await renderExactRequestToHtmlResponse(
			{
				method: 'GET',
				url: 'http://adapter.internal/account?tab=profile',
				headers: { host: 'attacker.example' }
			},
			runtime,
			(context) => {
				requestUrl = context.requestContext?.url;
				publicOrigin = context.requestContext?.publicOrigin;
				return createOperation('p', null, 'Account');
			},
			{ hydration: false }
		);

		expect(response.status).toBe(200);
		expect(requestUrl?.href).toBe('https://public.example.test/account?tab=profile');
		expect(publicOrigin?.href).toBe('https://public.example.test/');
		await runtime.dispose?.();
	});

	it('retains component authorization on the high-level server context', async () => {
		const runtime = createExactServerRuntime({
			contract: {
				version: 1,
				invocations: { read: defineExactOperationContract('read') },
				boundaries: {}
			},
			componentAuthorization: {
				protocol: 1,
				buildKey: 'authorized-build',
				fingerprint: 'authorized-fingerprint'
			},
			invocations: { read: () => ({}) }
		});
		const body = { type: 'invoke' as const, id: 'read' };

		const missing = await handleExactRequest({ method: 'POST', body }, runtime);
		const accepted = await handleExactRequest(
			{
				method: 'POST',
				headers: { 'x-exact-component-authorization': 'authorized-fingerprint' },
				body
			},
			runtime
		);

		expect(missing.status).toBe(410);
		expect(await exactResponseToFetchResponse(missing).json()).toEqual({
			error: 'exact_build_unsupported'
		});
		expect(accepted.status).toBe(200);
		await runtime.dispose?.();
	});

	it('projects dispatch limits through the high-level server runtime', async () => {
		const runtime = createExactServerRuntime({
			contract: { version: 1, invocations: {}, boundaries: {} },
			limits: { maxRequestBytes: 1024, maxBatchOperations: 4 }
		});

		expect(runtime.limits).toEqual({ maxRequestBytes: 1024, maxBatchOperations: 4 });
		await runtime.dispose?.();
	});

	it('aborts active operations when the high-level runtime closes', async () => {
		const requestAbort = new AbortController();
		let started!: () => void;
		const operationStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		let operationSignal: AbortSignal | undefined;
		const runtime = createExactServerRuntime({
			contract: {
				version: 1,
				invocations: { wait: defineExactOperationContract('wait') },
				boundaries: {}
			},
			invocations: {
				async wait(_input, context) {
					operationSignal = context.signal;
					started();
					await new Promise<void>((resolve) =>
						context.signal?.addEventListener('abort', () => resolve(), { once: true })
					);
					return {};
				}
			}
		});
		const response = handleExactRequest(
			{
				method: 'POST',
				signal: requestAbort.signal,
				body: { type: 'invoke', id: 'wait' }
			},
			runtime
		);

		try {
			await operationStarted;
			await runtime.dispose?.();
			expect(operationSignal?.aborted).toBe(true);
			expect(operationSignal?.reason).toBe('eXact server runtime disposed');
			expect(requestAbort.signal.aborted).toBe(false);
			expect((await response).status).toBe(200);
		} finally {
			requestAbort.abort('test cleanup');
			await runtime.dispose?.();
		}
	});

	it('settles request providers before exposing a progressive response', async () => {
		let release!: () => void;
		const ready = new Promise<void>((resolve) => {
			release = resolve;
		});
		const disposed: string[] = [];
		let rendered = false;
		const runtime = createExactServerRuntime({
			contract: { version: 1, invocations: {}, boundaries: {} },
			requestContexts: [
				[
					RequestName,
					{
						async create() {
							await ready;
							return 'ready';
						},
						dispose: (value) => {
							disposed.push(value);
						}
					}
				]
			]
		});

		const pending = renderExactRequestToProgressiveHtmlResponse(
			{
				method: 'GET',
				url: 'https://example.test/progressive'
			},
			runtime,
			(context) => {
				rendered = true;
				expect(context.contexts?.getSync(RequestName)).toBe('ready');
				return createOperation(SettledRequestPage, {});
			},
			{ markers: false, hydration: false }
		);

		await Promise.resolve();
		expect(rendered).toBe(false);
		release();
		const response = await pending;
		expect(rendered).toBe(true);
		expect(response.status).toBe(206);
		expect(response.headers['x-precommit']).toBe('settled');
		// Buffered progressive responses no longer retain request resources merely
		// to support an adapter's optional Web-stream representation.
		expect(disposed).toEqual(['ready']);
		expect(await exactResponseToFetchResponse(response).text()).toBe(
			'<div id="exact-root"><p>settled</p></div>'
		);
		expect(disposed).toEqual(['ready']);
		await runtime.dispose?.();
	});

	it('commits redirects and rejects response mutations after SSR returns', async () => {
		const runtime = createExactServerRuntime({
			contract: { version: 1, invocations: {}, boundaries: {} }
		});
		resetActiveRequest();

		const response = await renderExactRequestToHtmlResponse(
			{
				method: 'GET',
				url: 'https://example.test/private'
			},
			runtime,
			() => createOperation(RedirectRequestPage, {}),
			{
				hydration: false,
				markers: false
			}
		);

		expect(response.status).toBe(307);
		expect(response.headers.location).toBe('/sign-in');
		expect(() => readActiveRequest()!.setHeader('x-too-late', 'yes')).toThrow(
			'after its status and headers are committed'
		);
		await runtime.dispose?.();
	});

	it('passes the active request scope through boundary refresh rendering', async () => {
		const runtime = createExactServerRuntime({
			contract: {
				version: 1,
				invocations: {},
				boundaries: { profile: defineExactBoundaryContract('profile') }
			},
			requestContexts: [
				[
					RequestName,
					{
						create: (scope) => scope.request!.url.pathname
					}
				]
			],
			boundaries: {
				profile: () => createOperation(RefreshProfile, {})
			},
			markers: false
		});

		const response = await handleExactRequest(
			{
				method: 'POST',
				url: 'https://example.test/__exact',
				body: { type: 'refresh', id: 'profile' }
			},
			runtime
		);
		expect((await exactResponseToFetchResponse(response).json()).html).toBe('<p>/__exact:POST</p>');
		await runtime.dispose?.();
	});

	it('creates a ready server runtime context from contract-scoped handlers', async () => {
		const runtime = createExactServerRuntime({
			contract: {
				version: 1,
				invocations: {
					'save-profile': defineExactOperationContract('save-profile', {
						componentId: 'Profile',
						writes: [{ path: 'saved', kind: 'write', confidence: 'exact' }],
						boundaries: ['profile']
					})
				},
				executors: {},
				boundaries: {
					profile: defineExactBoundaryContract('profile', {
						componentId: 'Profile',
						ownerComponentId: 'Profile'
					})
				}
			},
			markers: false,
			patchStrategy: 'element',
			authorize: () => true,
			invocations: {
				'save-profile': () => ({ state: { saved: true } })
			},
			boundaries: {
				profile: () => createOperation('p', { className: 'saved' }, 'Saved')
			}
		});

		const response = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'invoke',
					id: 'save-profile',
					boundaryHtmls: {
						profile: '<p class="old">Loading</p>'
					}
				}
			},
			runtime
		);

		expect(response.status).toBe(200);
		expect(await exactResponseToFetchResponse(response).json()).toMatchObject({
			ok: true,
			state: { saved: true },
			patches: [
				{ type: 'prop', id: 'profile', name: 'class', value: 'saved' },
				{ type: 'text', id: 'profile', value: 'Saved' }
			]
		});
	});
});
