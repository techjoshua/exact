import { expect, test } from '@playwright/test';
import { comparePresentation, type Presentation } from '../e2e-support/presentation-parity.js';

const participants = [
	{ id: 'exact-native', url: 'http://127.0.0.1:4501' },
	{ id: 'react-native', url: 'http://127.0.0.1:4502' }
];

for (const profile of [
	{ name: 'desktop', viewport: { width: 1280, height: 900 }, isMobile: false },
	{ name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true }
]) {
	for (const javaScriptEnabled of [false, true]) {
		test(`${profile.name}: native ${javaScriptEnabled ? 'interactive' : 'SSR'} presentation matches`, async ({
			browser,
			request
		}, info) => {
			test.setTimeout(120_000);
			const references = new Map<string, Presentation>();
			for (const participant of participants) {
				expect(
					(await request.post(`${participant.url}/__benchmark/reset`, { data: {} })).ok()
				).toBe(true);
				const context = await browser.newContext({
					viewport: profile.viewport,
					isMobile: profile.isMobile,
					javaScriptEnabled
				});
				try {
					const page = await context.newPage();
					await page.goto(`${participant.url}/incidents/inc-100`);
					await expect(page).toHaveTitle('Incident Operations');
					if (javaScriptEnabled)
						await expect(page.locator('.connection')).toHaveText('Live service');
					const capture = (state: string) =>
						comparePresentation(page, references, participant.id, state, info);
					await capture('initial');
					if (!javaScriptEnabled) continue;
					await page.getByLabel('Severity').selectOption('high');
					await expect(page.getByTestId('incident-row')).toHaveCount(1);
					await capture('filtered');
					// Native measurements use deep-linked documents; compare the same selected route.
					await page.goto(`${participant.url}/incidents/inc-101`);
					await expect(page.locator('.connection')).toHaveText('Live service');
					await page.getByLabel('Severity').selectOption('high');
					await expect(
						page.getByRole('heading', { name: 'Delayed fulfillment events' })
					).toBeVisible();
					await capture('selected');
					await page.getByRole('button', { name: 'Claim incident' }).click();
					await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
					await expect(
						page.locator('.facts').getByText('Alex Chen', { exact: true })
					).toBeVisible();
					await capture('claimed');
					await page.getByLabel('New comment').fill('Checking the shared presentation.');
					await page.getByRole('button', { name: 'Add comment' }).click();
					await expect(page.getByText('Version 3', { exact: true })).toBeVisible();
					await expect(
						page.getByText('Checking the shared presentation.', { exact: true })
					).toHaveCount(1);
					await capture('comment');
					await page.getByRole('button', { name: 'Start analysis' }).click();
					await expect(page.getByText('Analysis completed', { exact: true })).toBeVisible();
					await capture('analysis');
				} finally {
					await context.close();
				}
			}
		});
	}
}
