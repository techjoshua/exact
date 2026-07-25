import { createContext, createVNode, type Component } from '@exactjs/core';
import { RequestContext } from '@exactjs/request';
import {
	defineExactActionContract,
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
			contract: { version: 1, actions: {}, boundaries: {} },
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
			this.task.server(async () => {
				await Promise.resolve();
				this.state.ready = `${name}:${request.method}`;
				request.setStatus(201);
				request.setHeader('x-rendered', 'yes');
			});
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

	it('settles request providers before exposing a progressive response', async () => {
		let release!: () => void;
		const ready = new Promise<void>((resolve) => {
			release = resolve;
		});
		const disposed: string[] = [];
		let rendered = false;
		const runtime = createExactServerRuntime({
			contract: { version: 1, actions: {}, boundaries: {} },
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
					this.task.server(async () => {
						await Promise.resolve();
						this.state.value = 'settled';
						request.setStatus(206);
						request.setHeader('x-precommit', 'settled');
					});
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
		expect(disposed).toEqual([]);
		expect(await readStreamText(response.stream!)).toBe(
			'<div id="exact-root"><p>settled</p></div>'
		);
		expect(disposed).toEqual(['ready']);
		await runtime.dispose?.();
	});

	it('commits redirects and rejects response mutations after SSR returns', async () => {
		const runtime = createExactServerRuntime({
			contract: { version: 1, actions: {}, boundaries: {} }
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
		expect(response.headers.location).toBe('https://example.test/sign-in');
		expect(() => activeRequest!.setHeader('x-too-late', 'yes')).toThrow(
			'after its status and headers are committed'
		);
		await runtime.dispose?.();
	});

	it('passes the active request scope through boundary refresh rendering', async () => {
		const runtime = createExactServerRuntime({
			contract: {
				version: 1,
				actions: {},
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
				actions: {
					'save-profile': defineExactActionContract('save-profile', {
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
			actions: {
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
					type: 'action',
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
