import { expect, test } from '@playwright/test';
import { ssrRenderMode, supportsSsrRenderMode } from '../src/ssr-render-mode.mjs';

const serviceUrl = 'http://127.0.0.1:4310';
const participants = [
	{ id: 'exact', url: 'http://127.0.0.1:4401' },
	{ id: 'react', url: 'http://127.0.0.1:4402' },
	{ id: 'sveltekit', url: 'http://127.0.0.1:4403' },
	{ id: 'nuxt', url: 'http://127.0.0.1:4404' },
	{ id: 'tanstack-start', url: 'http://127.0.0.1:4405' }
].filter((participant) => supportsSsrRenderMode(participant.id, ssrRenderMode()));

for (const participant of participants) {
	test.describe(participant.id, () => {
		test.beforeEach(async ({ request }) => {
			const response = await request.post(`${serviceUrl}/__benchmark/reset`, {
				headers: { 'x-benchmark-control': 'fixture-reset' },
				data: {}
			});
			expect(response.ok()).toBe(true);
		});

		test('serves meaningful HTML before JavaScript and hydrates it', async ({ browser }) => {
			const noScript = await browser.newContext({ javaScriptEnabled: false });
			const serverPage = await noScript.newPage();
			const response = await serverPage.goto(`${participant.url}/incidents/inc-101`);
			expect(response?.ok()).toBe(true);
			const documentHtml = await response!.text();
			expect(documentHtml).toMatch(/^\s*<!doctype html>/i);
			for (const tag of ['html', 'head', 'body']) {
				expect(documentHtml.match(new RegExp(`<${tag}(?:\\s|>)`, 'gi'))).toHaveLength(1);
				expect(documentHtml).toMatch(new RegExp(`</${tag}>`, 'i'));
			}
			if (participant.id === 'exact' || participant.id === 'react') {
				const html = await response!.text();
				expect(html).toMatch(/^<!doctype html>/i);
				expect(html.match(/<html(?:\s|>)/gi)).toHaveLength(1);
				expect(html.match(/<head(?:\s|>)/gi)).toHaveLength(1);
				expect(html.match(/<body(?:\s|>)/gi)).toHaveLength(1);
				expect(html).toMatch(/<\/body><\/html>$/i);
				await expect(serverPage).toHaveTitle('Incident Operations');
				await expect(serverPage.locator('head meta[name="viewport"]')).toHaveAttribute(
					'content',
					'width=device-width, initial-scale=1.0'
				);
				await expect(serverPage.locator('head script[src]')).not.toHaveCount(0);
				const hydrationId = participant.id === 'exact' ? '__exact_hydration' : 'comparison-data';
				expect(
					JSON.parse((await serverPage.locator(`#${hydrationId}`).textContent()) ?? '')
				).toBeTruthy();
			}
			await expect(
				serverPage.getByRole('heading', { name: 'Delayed fulfillment events' })
			).toBeVisible();
			await noScript.close();

			const hydratedContext = await browser.newContext();
			const hydrated = await hydratedContext.newPage();
			if (participant.id === 'exact') {
				await hydrated.addInitScript(() => {
					document.addEventListener(
						'DOMContentLoaded',
						() => {
							(
								globalThis as typeof globalThis & { __exactServerApp: Element | null }
							).__exactServerApp = document.querySelector('#app > .app-shell');
							(
								globalThis as typeof globalThis & { __exactServerScripts: Element[] }
							).__exactServerScripts = Array.from(document.querySelectorAll('script[src]'));
						},
						{ once: true }
					);
					const replaceChildren = Element.prototype.replaceChildren;
					(
						globalThis as typeof globalThis & { __exactRootReplacements: number }
					).__exactRootReplacements = 0;
					Element.prototype.replaceChildren = function (...nodes) {
						if (this.id === 'app')
							(globalThis as typeof globalThis & { __exactRootReplacements: number })
								.__exactRootReplacements++;
						return replaceChildren.apply(this, nodes);
					};
				});
			}
			await hydrated.goto(`${participant.url}/incidents/inc-101`);
			if (participant.id === 'exact')
				expect(
					await hydrated.evaluate(
						() =>
							(globalThis as typeof globalThis & { __exactRootReplacements: number })
								.__exactRootReplacements
					)
				).toBe(0);
			await hydrated.getByLabel('Severity').selectOption('critical');
			await expect(hydrated.getByTestId('incident-row')).toHaveCount(1);
			if (participant.id === 'exact')
				expect(
					await hydrated.evaluate(() => {
						const original = (
							globalThis as typeof globalThis & { __exactServerApp: Element | null }
						).__exactServerApp;
						const scripts = (globalThis as typeof globalThis & { __exactServerScripts: Element[] })
							.__exactServerScripts;
						const currentScripts = Array.from(document.querySelectorAll('script[src]'));
						return (
							original !== null &&
							original === document.querySelector('#app > .app-shell') &&
							scripts.length > 0 &&
							scripts.length === currentScripts.length &&
							scripts.every((script, index) => script === currentScripts[index])
						);
					})
				).toBe(true);
			await hydratedContext.close();
		});

		test('loads the same queue and claims optimistically', async ({ page }) => {
			await page.goto(participant.url);
			await expect(page.getByRole('heading', { name: 'Incident queue' })).toBeVisible();
			await expect(page.getByTestId('incident-row')).toHaveCount(3);
			await expect(page.getByText('Loading incidents…')).toHaveCount(0);
			await page.getByRole('button', { name: /Checkout authorization failures/ }).click();
			await page.getByRole('button', { name: 'Claim incident' }).click();
			await expect(page.getByText('Alex Chen', { exact: true })).toBeVisible();
			await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
		});

		test('recovers from a stale optimistic claim', async ({ page, request }) => {
			await page.goto(`${participant.url}/incidents/inc-100`);
			await expect(page.getByRole('button', { name: 'Claim incident' })).toBeVisible();
			await expect(page.locator('.connection')).toHaveText('Live service');
			const competingClaim = await request.post(`${serviceUrl}/api/incidents/inc-100/claim`, {
				data: { actorId: 'user-riley', expectedVersion: 1 }
			});
			expect(competingClaim.ok()).toBe(true);
			await page.getByRole('button', { name: 'Claim incident' }).click();
			await expect(page.getByRole('alert')).toContainText('changed while you were viewing it');
			await expect(page.getByText('Riley Morgan', { exact: true })).toBeVisible();
		});

		test('submits one comment and follows server analysis progress', async ({ page }) => {
			await page.goto(`${participant.url}/incidents/inc-102`);
			await page.getByLabel('New comment').fill('Checking the index workers.');
			await page.getByRole('button', { name: 'Add comment' }).click();
			await expect(page.getByText('Checking the index workers.')).toHaveCount(1);

			await page.getByRole('button', { name: 'Start analysis' }).click();
			await expect(page.getByText('Analysis completed', { exact: true })).toBeVisible();
			await expect(page.getByText('Correlated upstream failures')).toBeVisible();
		});

		test('preserves focused input across a second-session live update', async ({
			page,
			request
		}) => {
			await page.goto(`${participant.url}/incidents/inc-102`);
			const draft = page.getByLabel('New comment');
			await draft.fill('My response remains in progress.');
			await draft.focus();
			const response = await request.post(`${serviceUrl}/api/incidents/inc-102/comments`, {
				data: {
					actorId: 'user-riley',
					body: 'Second-session observation.',
					clientMutationId: `${participant.id}-second-session`
				}
			});
			expect(response.ok()).toBe(true);
			await expect(page.getByText('Second-session observation.')).toBeVisible();
			await expect(draft).toBeFocused();
			await expect(draft).toHaveValue('My response remains in progress.');
		});

		test('reports validation and a recoverable transport failure', async ({ page, request }) => {
			await page.goto(`${participant.url}/incidents/inc-100`);
			await page.getByLabel('New comment').fill('   ');
			await page.getByRole('button', { name: 'Add comment' }).click();
			await expect(page.getByRole('alert')).toContainText('1 to 2,000');

			const reset = await request.post(`${serviceUrl}/__benchmark/reset`, {
				headers: { 'x-benchmark-control': 'fixture-reset' },
				data: { failure: { method: 'GET', path: '/api/incidents', status: 503, count: 1 } }
			});
			expect(reset.ok()).toBe(true);
			await page.getByRole('button', { name: 'Refresh' }).click();
			await expect(page.getByText('Service unavailable', { exact: true })).toBeVisible();
			await page.getByRole('button', { name: 'Refresh' }).click();
			await expect(page.getByText('Service unavailable')).toHaveCount(0);
		});

		test('handles empty data, keyboard selection, and event-stream reconnect', async ({
			page,
			request
		}) => {
			let reset = await request.post(`${serviceUrl}/__benchmark/reset`, {
				headers: { 'x-benchmark-control': 'fixture-reset' },
				data: { empty: true }
			});
			expect(reset.ok()).toBe(true);
			await page.goto(participant.url);
			await expect(page.getByText('No incidents match this workspace.')).toBeVisible();

			reset = await request.post(`${serviceUrl}/__benchmark/reset`, {
				headers: { 'x-benchmark-control': 'fixture-reset' },
				data: {}
			});
			expect(reset.ok()).toBe(true);
			await page.reload();
			const secondIncident = page.getByRole('button', { name: /Delayed fulfillment events/ });
			await secondIncident.focus();
			await page.keyboard.press('Enter');
			await expect(page.getByRole('heading', { name: 'Delayed fulfillment events' })).toBeVisible();

			reset = await request.post(`${serviceUrl}/__benchmark/reset`, {
				headers: { 'x-benchmark-control': 'fixture-reset' },
				data: { disconnectEvents: true }
			});
			expect(reset.ok()).toBe(true);
			await expect(page.locator('.connection')).toHaveText('Live service', { timeout: 10_000 });
		});
	});
}
