import { activateTaskForHost, createContext, defineTask, type Component } from '@exactjs/core';
import { RequestContext } from '@exactjs/request';
import {
	defineExactOperationContract,
	defineExactBoundaryContract,
	handleExactRequest
} from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import {
	createExactServerRuntime,
	renderExactRequestToHtmlResponse,
	renderExactRequestToProgressiveHtmlResponse
} from './index.js';
import { readStreamText } from './test-support/streams.js';
import { createVNode } from './test-support/native-vnode.js';

describe('@exactjs/ssr request-context', () => {
	const ApplicationName = createContext<string>('ssr.application', {
		reactive: false,
		scope: 'application'
	});

	const RequestName = createContext<string>('ssr.request', {
		reactive: false,
		scope: 'request'
	});

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

		function Page(this: Component<{ ready: string }>) {
			const request = this.getContext(RequestContext);
			const name = this.getContext(RequestName);
			this.state.ready = 'loading';
			activateTaskForHost(
				this,
				defineTask({ placement: 'server' }, async () => {
					await Promise.resolve();
					this.state.ready = `${name}:${request.method}`;
					request.setStatus(201);
					request.setHeader('x-rendered', 'yes');
				})
			);
			return () => createVNode('p', null, this.state.ready);
		}

		const response = await renderExactRequestToHtmlResponse(
			{
				method: 'GET',
				url: 'https://example.test/account'
			},
			runtime,
			() => createVNode(Page, {}),
			{
				hydration: false,
				markers: false
			}
		);

		expect(response.status).toBe(201);
		expect(response.headers['x-rendered']).toBe('yes');
		expect(response.body).toBe('<p>app:/account:GET</p>');
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
				return createVNode('p', null, 'Account');
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
		expect(JSON.parse(missing.body)).toEqual({ error: 'exact_build_unsupported' });
		expect(accepted.status).toBe(200);
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
				function Settled(this: Component<{ value: string }>) {
					const request = this.getContext(RequestContext);
					this.state.value = 'pending';
					activateTaskForHost(
						this,
						defineTask({ placement: 'server' }, async () => {
							await Promise.resolve();
							this.state.value = 'settled';
							request.setStatus(206);
							request.setHeader('x-precommit', 'settled');
						})
					);
					return () => createVNode('p', null, this.state.value);
				}
				return createVNode(Settled, {});
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
		expect(await readStreamText(response.stream!)).toBe(
			'<div id="exact-root"><p>settled</p></div>'
		);
		expect(disposed).toEqual(['ready']);
		await runtime.dispose?.();
	});

	it('commits redirects and rejects response mutations after SSR returns', async () => {
		const runtime = createExactServerRuntime({
			contract: { version: 1, invocations: {}, boundaries: {} }
		});
		let activeRequest: import('@exactjs/request').RequestContextValue | undefined;
		function RedirectPage(this: Component<{}>) {
			activeRequest = this.getContext(RequestContext);
			activeRequest.redirect('/sign-in', 307);
			return () => createVNode('p', null, 'Redirecting');
		}

		const response = await renderExactRequestToHtmlResponse(
			{
				method: 'GET',
				url: 'https://example.test/private'
			},
			runtime,
			() => createVNode(RedirectPage, {}),
			{
				hydration: false,
				markers: false
			}
		);

		expect(response.status).toBe(307);
		expect(response.headers.location).toBe('/sign-in');
		expect(() => activeRequest!.setHeader('x-too-late', 'yes')).toThrow(
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
				profile: () => {
					function Profile(this: Component<{}>) {
						const requestName = this.getContext(RequestName);
						const request = this.getContext(RequestContext);
						return () => createVNode('p', null, `${requestName}:${request.method}`);
					}
					return createVNode(Profile, {});
				}
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
		expect(JSON.parse(response.body).html).toBe('<p>/__exact:POST</p>');
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
				profile: () => createVNode('p', { className: 'saved' }, 'Saved')
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
		expect(JSON.parse(response.body)).toMatchObject({
			ok: true,
			state: { saved: true },
			patches: [
				{ type: 'prop', id: 'profile', name: 'class', value: 'saved' },
				{ type: 'text', id: 'profile', value: 'Saved' }
			]
		});
	});
});
