/**
 * @vitest-environment jsdom
 */
import { createVNode, type ComponentFunction } from '@exact/core';
import { render, unmount } from '@exact/dom';
import { createExactClient, createExactRoot } from '@exact/hydrate';
import { registerExactRemoteClientBindings } from '@exact/microfrontends/client';
import { handleExactRequest, type ExactRequestLike, type ExactResponseLike } from '@exact/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Billing from './billing/src/Billing.js';
import BrandShell from './branding/src/BrandShell.js';
import CompactShell from './branding/src/CompactShell.js';
import PortalPage from './page/src/PortalPage.js';
import {
	billingRoot,
	brandingRoot,
	compactBrandingRoot,
	createSampleRuntimes
} from './server/runtime.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';
const remoteModules = {
	billing: remoteModule(Billing, billingRoot),
	branding: remoteModule(BrandShell, brandingRoot),
	compactBranding: remoteModule(CompactShell, compactBrandingRoot)
};

describe('trusted microfrontend portal sample', () => {
	beforeAll(() => registerExactRemoteClientBindings(remoteModules));
	afterEach(() => {
		vi.unstubAllGlobals();
		document.body.innerHTML = '';
	});

	it('routes page and mixed-root remote server work through one public endpoint', async () => {
		const runtimeHolder = {} as { current: ReturnType<typeof createSampleRuntimes> };
		const upstreamBodies: unknown[] = [];
		const upstreamFetch = async (input: string | URL | Request, init?: RequestInit) => {
			const context = String(input).includes(':4401')
				? runtimeHolder.current.billing
				: runtimeHolder.current.branding;
			upstreamBodies.push(JSON.parse(String(init?.body)));
			return responseFrom(await handleExactRequest(requestFrom(input, init), context));
		};
		const runtimes = createSampleRuntimes({ buildKey, fetch: upstreamFetch as typeof fetch });
		runtimeHolder.current = runtimes;

		const page = await handleExactRequest(
			{
				method: 'POST',
				url: 'https://portal.test/__exact',
				body: {
					type: 'action',
					id: 'page.audit',
					payload: { tenant: 'Northwind', accountId: 'ACCT-1042' }
				}
			},
			runtimes.page
		);
		expect(JSON.parse(page.body).state).toMatchObject({ source: 'page-host' });

		const branding = await handleExactRequest(
			{
				method: 'POST',
				url: 'https://portal.test/__exact',
				headers: {
					'x-exact-binding': 'branding',
					'x-exact-build': buildKey
				},
				body: {
					type: 'batch',
					version: 1,
					operations: [
						{ type: 'action', root: brandingRoot, id: 'branding.ping' },
						{ type: 'action', root: compactBrandingRoot, id: 'branding.ping' }
					]
				}
			},
			runtimes.page
		);
		const results = JSON.parse(branding.body).results;
		expect(results).toHaveLength(2);
		expect(results[0].state.variant).toBe('full');
		expect(results[1].state.variant).toBe('compact');

		await handleExactRequest(
			{
				method: 'POST',
				url: 'https://portal.test/__exact',
				headers: { 'x-exact-binding': 'billing', 'x-exact-build': buildKey },
				body: {
					type: 'batch',
					version: 1,
					operations: [
						{ type: 'action', root: billingRoot, id: 'billing.balance' },
						{ type: 'action', root: billingRoot, id: 'billing.history' }
					]
				}
			},
			runtimes.page
		);
		for (const request of [
			{ binding: undefined, root: 'page', id: 'page.summary' },
			{ binding: 'branding', root: brandingRoot, id: 'branding.summary' },
			{ binding: 'billing', root: billingRoot, id: 'billing.summary' }
		]) {
			await handleExactRequest(
				{
					method: 'POST',
					url: 'https://portal.test/__exact',
					headers: {
						...(request.binding ? { 'x-exact-binding': request.binding } : {}),
						...(request.binding ? { 'x-exact-build': buildKey } : {})
					},
					body: {
						type: 'refresh',
						root: request.root,
						id: request.id,
						payload: { tenant: 'Northwind', accountId: 'ACCT-1042' }
					}
				},
				runtimes.page
			);
		}
		expect(upstreamBodies).toHaveLength(4);
		expect(runtimes.observations).toMatchObject({
			pageExecutions: 1,
			brandingExecutions: 2,
			billingExecutions: 2,
			pageServerRenders: 1,
			brandingServerRenders: 1,
			billingServerRenders: 1
		});

		const unauthorized = await handleExactRequest(
			{
				method: 'POST',
				url: 'http://localhost:4401/__exact',
				headers: { 'x-exact-build': buildKey },
				body: { type: 'action', root: billingRoot, id: 'billing.balance' }
			},
			runtimes.billing
		);
		expect(unauthorized.status).toBe(403);
	});

	it('keeps live page context and independently reactive islands across three roots', async () => {
		const runtimeHolder = {} as { current: ReturnType<typeof createSampleRuntimes> };
		const browserBodies: Array<Record<string, unknown>> = [];
		const upstreamFetch = async (input: string | URL | Request, init?: RequestInit) => {
			const context = String(input).includes(':4401')
				? runtimeHolder.current.billing
				: runtimeHolder.current.branding;
			return responseFrom(await handleExactRequest(requestFrom(input, init), context));
		};
		const runtimes = createSampleRuntimes({ buildKey, fetch: upstreamFetch as typeof fetch });
		runtimeHolder.current = runtimes;
		vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
			browserBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return responseFrom(
				await handleExactRequest(
					{ ...requestFrom(input, init), url: 'https://portal.test/__exact' },
					runtimes.page
				)
			);
		});

		const container = document.createElement('div');
		document.body.append(container);
		const pageClient = createExactClient(container, { endpoint: '/__exact' });
		render(createExactRoot(pageClient, PortalPage), container);

		await waitFor(() => text('billing-context').includes('Northwind'));
		expect(text('page-context')).toContain('Northwind');
		expect(text('branding-shell')).toContain('Northwind Account Center');
		expect(text('billing-context')).toContain('Northwind · light');

		click('page-owned-account');
		expect(text('page-owned-account')).toContain('local clicks 1');
		click('branding-island');
		expect(text('branding-island')).toContain('· 1');
		clickButton('Toggle late island');
		await waitFor(() => text('late-billing-island').includes('Northwind / light'));

		clickButton('Switch live page context');
		await waitFor(() => text('billing-context').includes('Contoso'));
		expect(text('branding-shell')).toContain('Contoso Account Center');
		expect(text('page-owned-account')).toContain('ACCT-2048');
		expect(text('page-owned-account')).toContain('local clicks 1');
		expect(text('late-billing-island')).toContain('Contoso / light');

		clickButton('Toggle theme');
		await waitFor(() => text('late-billing-island').includes('/ dark'));
		expect(text('branding-island')).toContain('dark');

		expect(runtimes.observations).toMatchObject({
			pageExecutions: 0,
			brandingExecutions: 0,
			billingExecutions: 0,
			pageServerRenders: 0,
			brandingServerRenders: 0,
			billingServerRenders: 0
		});
		expect(browserBodies).toEqual([]);

		clickButton('Switch remote exposure');
		await waitFor(() => document.querySelector('[data-testid="compact-branding-shell"]') !== null);
		expect(text('compact-branding-shell')).toContain('Contoso Compact');
		clickButton('Toggle remote failure');
		await waitFor(() => document.querySelector('[role="alert"]') !== null);
		expect(document.querySelector('[role="alert"]')?.textContent).toContain(
			'branding application is unavailable'
		);
		clickButton('Toggle remote failure');
		await waitFor(() => document.querySelector('[data-testid="compact-branding-shell"]') !== null);

		unmount(container);
	});
});

function remoteModule(component: ComponentFunction<any, any>, root: string) {
	const globalName = `__exactSample${root.replace(/\W/g, '_')}`;
	(globalThis as Record<string, unknown>)[globalName] = component;
	const source = `export default Object.freeze({ buildKey: ${JSON.stringify(buildKey)}, root: ${JSON.stringify(root)}, component: globalThis[${JSON.stringify(globalName)}], registration: {} });`;
	return Object.freeze({
		clientEntry: `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
	});
}

function requestFrom(input: string | URL | Request, init?: RequestInit): ExactRequestLike {
	return {
		method: init?.method ?? 'POST',
		url: String(input),
		headers: new Headers(init?.headers),
		body: init?.body ? JSON.parse(String(init.body)) : undefined,
		signal: init?.signal ?? undefined
	};
}

function responseFrom(response: ExactResponseLike): Response {
	return new Response(response.stream ?? response.body, {
		status: response.status,
		headers: response.headers
	});
}

function text(testId: string): string {
	return document.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';
}

function click(testId: string): void {
	(document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null)?.click();
}

function clickButton(label: string): void {
	const button = [...document.querySelectorAll('button')].find(
		(candidate) => candidate.textContent?.trim() === label
	);
	if (!button) throw new Error(`Missing button ${JSON.stringify(label)}`);
	button.click();
}

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error(`Sample did not settle: ${document.body.innerHTML}`);
}
