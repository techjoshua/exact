/**
 * @vitest-environment jsdom
 */
import { createVNode } from '@exactjs/core';
import {
	createExactClient,
	hydrateClientIslands,
	readExactHydrationConfig
} from '@exactjs/hydrate';
import { handleExactRequest } from '@exactjs/server';
import { flushSync } from '@exactjs/reactive';
import { createExactServerRuntime, renderExactRequestToHtmlResponse } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import { IdentityProvider } from '../.exact/IdentityProvider.exact.client.js';
import { ServerIdentityProjection } from '../.exact/ServerIdentityProjection.exact.server.js';
import { ProfilePage_ExactClient_1 } from '../.exact/ProfilePage.exact.client.js';
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

async function readStreamText(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let text = '';
	while (true) {
		const next = await reader.read();
		if (next.done) return text;
		text += decoder.decode(next.value);
	}
}

describe('@exactjs/sample-server-components', () => {
	it('streams the initial document as a hydratable html response', async () => {
		const response = renderProfilePageResponse('Ada');

		expect(response.status).toBe(200);
		expect(response.headers['content-type']).toBe('text/html; charset=utf-8');

		const html = await readStreamText(response.stream!);

		expect(html).toContain('<div id="app">');
		expect(html).toContain('Ada');
		expect(html).toContain('<script type="application/json" id="__exact_hydration">');
		expect(html).toContain('"endpoint":"/__exact"');
	});

	it('hydrates a generated client island and applies a server action refresh', async () => {
		const rendered = await renderProfilePage('Ada');
		const container = document.createElement('div');
		const requests: unknown[] = [];
		container.innerHTML = rendered.htmlWithHydration;

		expect(rendered.html).not.toContain('<!--exact:');
		const config = readExactHydrationConfig(container);
		const islands = { ProfilePage_ExactClient_1 };
		const client = createExactClient(container, {
			...config,
			islands,
			fetch: async (_url, init) => {
				const body = JSON.parse(init.body);
				requests.push(body);
				const response = await handleExactServerRequest({
					method: init.method,
					url: config.endpoint,
					headers: init.headers,
					body
				});
				return {
					ok: response.status >= 200 && response.status < 300,
					status: response.status,
					json: async () => JSON.parse(response.body)
				};
			}
		});

		expect(container.querySelector('[data-exact-client-hydrated="true"]')).toBeNull();
		const button = container.querySelector('button')!;
		expect(button.textContent).toBe('Saved 0 times');
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		flushSync();
		expect(container.querySelector('button')).not.toBe(button);
		expect(container.querySelector('[data-exact-client-hydrated="true"]')).not.toBeNull();
		expect(container.querySelector('button')?.textContent).toBe('Saved 1 times');
		expect(config.continuations?.['save-profile']?.boundaries).toContain(
			container
				.querySelector('[data-exact-client-boundary]')
				?.getAttribute('data-exact-client-boundary')
		);

		await client.invokeAction('save-profile');

		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			type: 'action',
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
		try {
			const response = await renderExactRequestToHtmlResponse(
				{
					method: 'GET',
					url: 'https://example.test/profile',
					headers: {}
				},
				runtime,
				() => createVNode(ServerIdentityProjection, {}),
				{
					hydration: false,
					markers: false
				}
			);

			expect(response.body).toContain('Northwind:editor');
			expect(response.body).toContain('data-editor="true"');

			const container = document.createElement('div');
			const props = JSON.stringify({ props: { initial: identity } })
				.replace(/&/g, '&amp;')
				.replace(/"/g, '&quot;');
			container.innerHTML = `<div data-exact-client-boundary="identity" data-exact-client-name="IdentityProvider" data-exact-client-props="${props}">${response.body}</div>`;

			expect(
				hydrateClientIslands(container, {
					IdentityProvider
				})
			).toBe(1);
			const button = container.querySelector('button');
			expect(button?.textContent).toBe('Northwind:editor');
			expect(button?.getAttribute('data-brand')).toBe('Northwind');
			expect(button?.getAttribute('data-accent')).toBe('#2255aa');
			expect(button?.getAttribute('data-editor')).toBe('true');
		} finally {
			await runtime.dispose?.();
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
						body: JSON.stringify({ type: 'action', id: 'save-profile' })
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
		actions: {
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
		authorize: async (_request, _input, context) => {
			const authorization = await context.contexts!.get(ServerAuthorizationContext);
			return authorization.roles().includes('editor');
		}
	});
}
