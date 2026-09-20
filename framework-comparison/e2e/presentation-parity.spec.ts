import { expect, test } from '@playwright/test';
import { comparePresentation, type Presentation } from '../e2e-support/presentation-parity.js';
import { ssrRenderMode, supportsSsrRenderMode } from '../src/ssr-render-mode.mjs';

const serviceUrl = 'http://127.0.0.1:4310';
const participants = ['exact', 'react', 'sveltekit', 'nuxt', 'tanstack-start']
	.map((id, index) => ({ id, url: `http://127.0.0.1:${4401 + index}` }))
	.filter(({ id }) => supportsSsrRenderMode(id, ssrRenderMode()));
const viewports = [
	{ name: 'desktop', viewport: { width: 1280, height: 900 }, isMobile: false },
	{ name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true }
];

test.use({ actionTimeout: 10_000 });

for (const profile of viewports) {
	test(`${profile.name}: server-rendered presentation matches before JavaScript`, async ({
		browser,
		request
	}, info) => {
		const references = new Map<string, Presentation>();
		for (const participant of participants) {
			const reset = await request.post(`${serviceUrl}/__benchmark/reset`, {
				headers: { 'x-benchmark-control': 'fixture-reset' },
				data: {}
			});
			expect(reset.ok()).toBe(true);
			const context = await browser.newContext({
				viewport: profile.viewport,
				isMobile: profile.isMobile,
				javaScriptEnabled: false
			});
			try {
				const page = await context.newPage();
				await page.goto(`${participant.url}/incidents/inc-100`);
				await expect(page).toHaveTitle('Incident Operations');
				await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
					'content',
					/^width=device-width, initial-scale=1(?:\.0)?$/
				);
				await expect(
					page.getByRole('heading', { name: 'Checkout authorization failures' })
				).toBeVisible();
				await comparePresentation(page, references, participant.id, 'ssr', info);
			} finally {
				await context.close();
			}
		}
	});

	test(`${profile.name}: interactive presentation matches across the shared scenarios`, async ({
		browser,
		request
	}, info) => {
		test.setTimeout(120_000);
		const references = new Map<string, Presentation>();
		for (const participant of participants) {
			const reset = (data: Record<string, unknown> = {}) =>
				request.post(`${serviceUrl}/__benchmark/reset`, {
					headers: { 'x-benchmark-control': 'fixture-reset' },
					data
				});
			expect((await reset()).ok()).toBe(true);
			const context = await browser.newContext({
				viewport: profile.viewport,
				isMobile: profile.isMobile
			});
			try {
				const page = await context.newPage();
				const capture = (state: string) =>
					comparePresentation(page, references, participant.id, state, info);
				await page.goto(`${participant.url}/incidents/inc-100`);
				await expect(page.locator('.connection')).toHaveText('Live service');
				await capture('initial');
				await page.getByLabel('Severity').selectOption('high');
				await expect(page.getByTestId('incident-row')).toHaveCount(1);
				await capture('filtered');
				await page.getByRole('button', { name: /Delayed fulfillment events/ }).click();
				await expect(
					page.getByRole('heading', { name: 'Delayed fulfillment events' })
				).toBeVisible();
				await capture('selected');
				await page.getByLabel('New comment').fill('   ');
				await page.getByRole('button', { name: 'Add comment' }).click();
				await expect(page.getByRole('alert')).toContainText('1 to 2,000');
				await capture('validation-error');
				await page.getByLabel('New comment').fill('Checking the shared presentation.');
				await page.getByRole('button', { name: 'Add comment' }).click();
				await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
				await expect(
					page.getByText('Checking the shared presentation.', { exact: true })
				).toHaveCount(1);
				await capture('comment');
				await page.getByRole('button', { name: 'Claim incident' }).click();
				await expect(page.locator('.facts').getByText('Alex Chen', { exact: true })).toBeVisible();
				await expect(page.getByText('Version 3', { exact: true })).toBeVisible();
				await capture('claimed');
				const competing = await request.post(`${serviceUrl}/api/incidents/inc-101/claim`, {
					data: { actorId: 'user-riley', expectedVersion: 3 }
				});
				expect(competing.ok()).toBe(true);
				await expect(
					page.locator('.facts').getByText('Riley Morgan', { exact: true })
				).toBeVisible();
				await page.getByRole('button', { name: 'Claim incident' }).click();
				await expect(page.getByRole('alert')).toContainText('changed while you were viewing it');
				await capture('conflict');
				await page.getByRole('button', { name: 'Start analysis' }).click();
				await expect(page.getByText('Analysis completed', { exact: true })).toBeVisible();
				await capture('analysis');
				expect(
					(
						await reset({
							failure: { method: 'GET', path: '/api/incidents', status: 503, count: 1 }
						})
					).ok()
				).toBe(true);
				await page.getByRole('button', { name: 'Refresh', exact: true }).click();
				await expect(page.getByText('Service unavailable', { exact: true })).toBeVisible();
				await capture('transport-error');
				expect((await reset({ empty: true })).ok()).toBe(true);
				await page.getByRole('button', { name: 'Refresh', exact: true }).click();
				await expect(page.getByText('No incidents match this workspace.')).toBeVisible();
				await capture('empty');
			} finally {
				await context.close();
			}
		}
	});
}
