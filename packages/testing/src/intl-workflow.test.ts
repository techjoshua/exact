/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import { render } from '@exactjs/dom';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import {
	composeExactExecutorContract,
	exactResponseToFetchResponse,
	handleExactRequest
} from '@exactjs/server';
import { createExactServerRuntime } from '@exactjs/ssr';
import { createExactClient, type ExactClient } from '@exactjs/hydrate';
import { testServerComponent } from './index.js';
import {
	IntlHost as Client,
	IntlOwner as ClientOwner
} from './test-support/intl-owner.fixtures.test.js';
import {
	IntlHost as Server,
	IntlOwner as ServerOwner
} from './test-support/intl-owner.fixtures.test.js?exact-target=server';

it('preserves root-local formatting through SSR, mounted clients, repeated continuations and disposal', async () => {
	const runtime = createExactServerRuntime({
		contract: composeExactExecutorContract([Server, ServerOwner])
	});
	const continuations = composeExactComponentContracts(
		[Client, ClientOwner],
		'client'
	).continuations;
	const roots: {
		client: ExactClient;
		container: Element;
		transport: { wait?: Promise<void>; held: boolean };
	}[] = [];
	const reports: unknown[] = [];
	try {
		for (const [locale, provider] of [
			['de-DE', true],
			['en-US', true],
			['en-US', false]
		] as const) {
			const server = provider
				? await testServerComponent(Server)
						.props({ locale })
						.render({ hydration: { endpoint: '/intl' } })
				: await testServerComponent(ServerOwner).render();
			const container = document.createElement('div');
			container.innerHTML = server.htmlWithHydration ?? server.html;
			const formatted = locale === 'de-DE' ? '1.234,5' : '1,234.5';
			expect([...container.querySelectorAll('p')].map((node) => node.textContent)).toEqual(
				Array(3).fill(formatted)
			);
			container.replaceChildren();
			const transport: { wait?: Promise<void>; held: boolean } = { held: false };
			const client = createExactClient(container, {
				endpoint: '/intl',
				batch: false,
				continuations,

				logger: {
					isEnabled: (level) => level === 'warn' || level === 'error',
					log: (report) => reports.push(report)
				},
				onErrorReport: (report) => reports.push(report),
				onDiagnostic: (diagnostic) => reports.push(diagnostic),
				fetch: async (_url, init) => {
					if (transport.wait) {
						transport.held = true;
						await transport.wait;
					}
					return exactResponseToFetchResponse(
						await handleExactRequest(
							{
								url: 'http://test/intl',
								method: init.method,
								headers: init.headers,
								body: JSON.parse(init.body),
								signal: init.signal
							},
							runtime
						)
					);
				}
			});
			roots.push({ client, container, transport });
			render(provider ? receipt(Client, { locale }) : receipt(ClientOwner, {}), container, {
				componentDomain: client.domain,
				onErrorReport: (report) => reports.push(report)
			});
			await client.whenSettled();
			const original = container.querySelector('output');
			(container.querySelector('[data-format]') as HTMLButtonElement).click();
			await vi.waitFor(() =>
				expect(container.querySelector('output')?.textContent).toBe(
					'value:' + Array(4).fill(formatted).join('|')
				)
			);
			expect(container.querySelector('output')).toBe(original);
		}
		const [left, right] = roots;
		let release!: () => void;
		left!.transport.wait = new Promise<void>((resolve) => {
			release = resolve;
		});
		(left!.container.querySelector('[data-again]') as HTMLButtonElement).click();
		await vi.waitFor(() => expect(left!.transport.held).toBe(true));
		(left!.container.querySelector('[data-french]') as HTMLButtonElement).click();
		flushSync();
		release();
		left!.transport.wait = undefined;
		await vi.waitFor(() =>
			expect(left!.container.querySelector('output')?.textContent).toBe('1.234,5')
		);
		(left!.container.querySelector('[data-again]') as HTMLButtonElement).click();
		await vi.waitFor(() => {
			expect(reports).toEqual([]);
			expect(left!.container.querySelector('output')?.textContent).toBe('1\u202f234,5');
		});
		left!.client.dispose();
		(right!.container.querySelector('[data-again]') as HTMLButtonElement).click();
		await vi.waitFor(() =>
			expect(right!.container.querySelector('output')?.textContent).toBe('1,234.5')
		);
		expect(reports).toEqual([]);
	} finally {
		for (const root of roots) root.client.dispose();
		await runtime.dispose?.();
	}
});
