import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(
	new URL('../../scripts/runtime-acceptance/package.json', import.meta.url)
);
const { chromium } = require('playwright');
const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (['warning', 'error'].includes(message.type())) errors.push(message.text());
	});
	await page.goto(process.argv[2]);
	await page
		.locator('[data-exact-client-name="Toggle"][data-exact-client-hydrated="true"]')
		.waitFor({ state: 'attached' });
	await page.getByRole('button', { name: 'light', exact: true }).click();
	await page.getByRole('button', { name: 'dark', exact: true }).waitFor();
	assert.equal(await page.locator('[data-exact-theme-appearance="dark"]').count(), 1);
	assert.equal(await page.locator('[data-retained]').textContent(), 'Retained content');
	assert.deepEqual(await page.evaluate(() => window.observation()), { retained: true, errors: [] });
	assert.equal(
		(await page.context().cookies()).find((cookie) => cookie.name === 'provider-appearance')?.value,
		'dark'
	);
	await page.getByRole('button', { name: 'dark', exact: true }).click();
	await page.getByRole('button', { name: 'light', exact: true }).waitFor();
	assert.equal(await page.locator('[data-exact-theme-appearance="light"]').count(), 1);
	assert.deepEqual(await page.evaluate(() => window.observation()), { retained: true, errors: [] });
	assert.equal(
		(await page.context().cookies()).find((cookie) => cookie.name === 'provider-appearance')?.value,
		'light'
	);
	assert.deepEqual(errors, []);
} finally {
	await browser.close();
}
