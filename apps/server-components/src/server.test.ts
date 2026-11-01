/**
 * @vitest-environment jsdom
 */
import { unmount } from '@exactjs/dom/framework/component-root';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import {
	createExactClient,
	hydrateClientIslands,
	readExactHydrationConfig
} from '@exactjs/hydrate';
import { exactResponseToFetchResponse, handleExactRequest } from '@exactjs/server';
import { flushSync } from '@exactjs/reactive';
import { createExactServerRuntime, renderExactRequestToHtmlResponse } from '@exactjs/ssr';
import { describe, expect, it, vi } from 'vitest';
import { IdentityProvider } from '../.exact/IdentityProvider.exact.client.js';
import { ServerIdentityProjection } from '../.exact/ServerIdentityProjection.exact.server.js';
import { exactHydrationRegistration } from '../.exact/hydration-registration.js';
import {
	ServerAuthorizationContext,
	ServerBrandContext,
	type PublicIdentity
} from './identity-context.js';
import {
	exactContract,
	handleExactServerRequest,
	renderProfilePage,
	renderProfilePageResponse
} from './server.js';

describe('@exactjs/sample-server-components', () => {
	it('streams the initial document as a hydratable html response', async () => {
		const response = renderProfilePageResponse('Ada');

		expect(response.status).toBe(200);
		expect(response.headers['content-type']).toBe('text/html; charset=utf-8');

		const html = await exactResponseToFetchResponse(response).text();

		expect(html).toContain('<div id="app">');
		expect(html).toContain('Ada');
		expect(html).toContain('<script type="application/json" id="__exact_hydration">');
		const container = document.createElement('div');
		container.innerHTML = html;
		expect(readExactHydrationConfig(container).endpoint).toBe('/__exact');
	});

	it('hydrates a generated client island and applies a server action refresh', async () => {
		const rendered = await renderProfilePage('Ada');
		const container = document.createElement('div');
		const requests: unknown[] = [];
		container.innerHTML = rendered.htmlWithHydration;

		expect(rendered.html).not.toContain('<!--exact:');
		const config = readExactHydrationConfig(container);
		const client = createExactClient(container, {
			...config,
			islands: exactHydrationRegistration.islands,
			fetch: async (_url, init) => {
				const body = JSON.parse(init.body);
				requests.push(body);
				const response = await handleExactServerRequest({
					method: init.method,
					url: config.endpoint,
					headers: init.headers,
					body
				});
				return exactResponseToFetchResponse(response);
			}
		});

		expect(container.querySelector('[data-exact-client-hydrated="true"]')).toBeNull();
		const button = container.querySelector('button')!;
		expect(button.textContent).toBe('Saved 0 times');
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await vi.waitFor(() =>
			expect(container.querySelector('[data-exact-client-hydrated="true"]')).not.toBeNull()
		);
		flushSync();
		expect(container.querySelector('button')).not.toBe(button);
		expect(container.querySelector('button')?.textContent).toBe('Saved 1 times');
		expect(config.continuations?.['save-profile']?.boundaries).toContain(
			container
				.querySelector('[data-exact-client-boundary]')
				?.getAttribute('data-exact-client-boundary')
		);

		await client.invokeTask('save-profile');

		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			type: 'invoke',
			id: 'save-profile'
		});
		expect(container.querySelector('section.saved')?.textContent).toBe('Saved on the server');
	});

	it('projects server identity into SSR and reconstructs context methods during hydration', async () => {
		const identity: PublicIdentity = {
			roles: ['viewer', 'editor'],
			brand: { name: 'Northwind', accent: '#2255aa' }
		};
		const runtime = identityRuntime(identity);
		const container = document.createElement('div');
		let boundary: Element | null = null;
		let failed = false;
		try {
			const response = await renderExactRequestToHtmlResponse(
				{
					method: 'GET',
					url: 'https://example.test/profile',
					headers: {}
				},
				runtime,
				() => createCompiledComponentInputReceipt(ServerIdentityProjection, {}),
				{
					hydration: false
				}
			);

			const html = await exactResponseToFetchResponse(response).text();
			expect(html).toContain('Northwind:editor');
			expect(html).toContain('data-editor="true"');

			container.innerHTML = html;
			boundary = container.querySelector('[data-exact-client-name="IdentityProvider"]');
			expect(container.querySelectorAll('[data-exact-client-boundary]')).toHaveLength(1);
			expect(container.querySelectorAll('button')).toHaveLength(1);
			const originalButton = container.querySelector('button');
			const hydration: unknown[] = [];

			expect(
				hydrateClientIslands(
					container,
					{ IdentityProvider },
					{ onHydration: (event) => hydration.push(event) }
				)
			).toBe(1);
			expect(hydration).toEqual([
				expect.objectContaining({ outcome: 'adopted', component: 'IdentityProvider' })
			]);
			expect(container.querySelectorAll('button')).toHaveLength(1);
			const button = container.querySelector('button');
			expect(button).toBe(originalButton);
			expect(button?.textContent).toBe('Northwind:editor');
			expect(button?.getAttribute('data-brand')).toBe('Northwind');
			expect(button?.getAttribute('data-accent')).toBe('#2255aa');
			expect(button?.getAttribute('data-editor')).toBe('true');
		} catch (error) {
			failed = true;
			throw error;
		} finally {
			const errors: unknown[] = [];
			try {
				if (boundary) unmount(boundary);
			} catch (error) {
				errors.push(error);
			}
			try {
				await runtime.dispose?.();
			} catch (error) {
				errors.push(error);
			}
			if (errors.length) {
				if (!failed) throw new AggregateError(errors, 'Identity test cleanup failed');
				console.error('Identity test cleanup failed', ...errors);
			}
		}
	});

	it('enforces authorization again inside trusted server action dispatch', async () => {
		const runtime = identityRuntime({
			roles: [],
			brand: { name: 'Northwind', accent: '#2255aa' }
		});
		try {
			const invoke = (roles: string) =>
				handleExactRequest(
					{
						method: 'POST',
						url: 'https://example.test/__exact',
						headers: {
							'content-type': 'application/json',
							'x-roles': roles
						},
						body: JSON.stringify({ type: 'invoke', id: 'save-profile' })
					},
					runtime
				);

			expect((await invoke('viewer')).status).toBe(403);
			expect((await invoke('viewer,editor')).status).toBe(200);
		} finally {
			await runtime.dispose?.();
		}
	});
});

function identityRuntime(identity: PublicIdentity) {
	return createExactServerRuntime({
		contract: exactContract,
		invocations: {
			'save-profile': () => ({ state: { saved: true } })
		},
		applicationContexts: [
			[
				ServerBrandContext,
				{
					value: {
						publicBrand: () => identity.brand
					}
				}
			]
		],
		requestContexts: ({ request }) => {
			const configured = request?.headers.get('x-roles');
			const roles =
				configured === null || configured === undefined
					? identity.roles
					: configured
							.split(',')
							.map((role) => role.trim())
							.filter(Boolean);
			return [
				[
					ServerAuthorizationContext,
					{
						value: {
							roles: () => roles
						}
					}
				]
			];
		},
		authorize: async (_request, context) => {
			const authorization = await context.contexts!.get(ServerAuthorizationContext);
			return authorization.roles().includes('editor');
		}
	});
}
