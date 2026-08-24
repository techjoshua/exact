import { expect, test } from '@playwright/test';

const participants = [
	{
		id: 'exact-native',
		url: 'http://127.0.0.1:4501',
		earlyClientResource: /<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc=)[^>]*>/i
	},
	{
		id: 'react-native',
		url: 'http://127.0.0.1:4502',
		earlyClientResource: /<link\b(?=[^>]*\brel="modulepreload")(?=[^>]*\bhref=)[^>]*>/i
	}
];

for (const participant of participants) {
	test.describe(participant.id, () => {
		test.beforeEach(async ({ request }) => {
			const response = await request.post(`${participant.url}/__benchmark/reset`, { data: {} });
			expect(response.ok()).toBe(true);
		});

		test('server renders meaningful HTML and hydrates filters', async ({ browser }) => {
			const noScript = await browser.newContext({ javaScriptEnabled: false });
			const serverPage = await noScript.newPage();
			const response = await serverPage.goto(`${participant.url}/incidents/inc-101`);
			expect(response?.headers()['x-comparison-render']).toBe('ssr');
			const documentHtml = (await response?.text()) ?? '';
			const documentHead = documentHtml.slice(0, documentHtml.indexOf('</head>'));
			expect(documentHead).toMatch(participant.earlyClientResource);
			await expect(
				serverPage.getByRole('heading', { name: 'Delayed fulfillment events' })
			).toBeVisible();
			await noScript.close();

			const context = await browser.newContext();
			const page = await context.newPage();
			await page.goto(participant.url);
			await page.getByLabel('Severity').selectOption('critical');
			await expect(page.getByTestId('incident-row')).toHaveCount(1);
			await context.close();
		});

		test('claims and comments through the framework server boundary', async ({ page }) => {
			await page.goto(`${participant.url}/incidents/inc-100`);
			await page.getByRole('button', { name: 'Claim incident' }).click();
			await expect(page.getByText('Alex Chen', { exact: true })).toBeVisible();
			await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
			await page.getByLabel('New comment').fill('Checking the native server path.');
			await page.getByRole('button', { name: 'Add comment' }).click();
			await expect(page.getByText('Checking the native server path.')).toHaveCount(1);
		});

		test('follows asynchronous analysis over the native event stream', async ({ page }) => {
			await page.goto(`${participant.url}/incidents/inc-102`);
			await page.getByRole('button', { name: 'Start analysis' }).click();
			await expect(page.getByText('Analysis completed', { exact: true })).toBeVisible();
			await expect(page.getByText('Correlated upstream failures')).toBeVisible();
		});

		test('preserves a focused draft across a second-session mutation', async ({ browser }) => {
			const firstContext = await browser.newContext();
			const secondContext = await browser.newContext();
			const first = await firstContext.newPage();
			const second = await secondContext.newPage();
			await Promise.all([
				first.goto(`${participant.url}/incidents/inc-102`),
				second.goto(`${participant.url}/incidents/inc-102`)
			]);
			const draft = first.getByLabel('New comment');
			await draft.fill('My native response remains in progress.');
			await draft.focus();
			await second.getByLabel('New comment').fill('Second-session observation.');
			await second.getByRole('button', { name: 'Add comment' }).click();
			await expect(first.getByText('Second-session observation.')).toBeVisible();
			await expect(draft).toBeFocused();
			await expect(draft).toHaveValue('My native response remains in progress.');
			await Promise.all([firstContext.close(), secondContext.close()]);
		});
	});
}
