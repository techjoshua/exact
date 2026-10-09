import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

/** Checks the browser catalog shared by optimized dependencies and reloaded authored components. */
async function verifyDevelopmentThemeBrowser(root, origin) {
	const require = createRequire(
		new URL('../../scripts/runtime-acceptance/package.json', import.meta.url)
	);
	const { chromium } = require('playwright');
	const sourceFile = path.join(root, 'Page.tsx');
	const original = await readFile(sourceFile, 'utf8');
	const browser = await chromium.launch();
	const errors = [];
	try {
		const page = await browser.newPage();
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
		});
		await page.goto(origin);
		await page.waitForLoadState('networkidle');
		for (const [index, label] of ['Initial', 'Second', 'Third', 'Initial'].entries()) {
			if (index > 0) await writeFile(sourceFile, original.replace('Initial', label));
			await page.getByText(label, { exact: true }).waitFor();
			const button = page.getByRole('button', { name: 'Ready', exact: true });
			await button.waitFor();
			assert.equal(await button.getAttribute('data-exact-theme-role'), 'status');
			assert.equal(await page.locator('[data-exact-theme-appearance="dark"]').count(), 1);
			await button.click();
			await page.getByRole('button', { name: 'Active', exact: true }).waitFor();
		}
		assert.deepEqual(errors, []);
	} catch (error) {
		console.error(JSON.stringify({ errors }));
		throw error;
	} finally {
		await writeFile(sourceFile, original);
		await browser.close();
	}
}
await verifyDevelopmentThemeBrowser(process.argv[2], process.argv[3]);
