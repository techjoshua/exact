import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

/** Applies one transition oracle to every installed production build; traces survive only failures. */
export async function checkPackedWorkbench(browser, url, { name, enabled, ssr, evidence }) {
	const context = await browser.newContext();
	await context.tracing.start({ screenshots: true, snapshots: true });
	let failed = false;
	try {
		const page = await context.newPage();
		page.setDefaultTimeout(15000);
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		// Hold the entry script so adoption is checked against real server nodes, not post-hydration DOM.
		let release;
		const gate = new Promise((resolve) => {
			release = resolve;
		});
		if (ssr)
			await page.route('**/*.js', async (route) => {
				await gate;
				await route.continue();
			});
		try {
			await page.goto(url, { waitUntil: ssr ? 'commit' : 'load' });
			await page.locator('[data-control]').waitFor();
			const button = await page.locator('[data-control]').elementHandle();
			const row = await page.locator('[data-row="b"]').elementHandle();
			const input = page.getByRole('textbox', { name: 'Notes' });
			await input.fill('user draft');
			await input.focus();
			release();
			if (ssr) await page.locator('#app[data-exact-hydrated="true"]').waitFor();
			assert.equal(
				await button.evaluate((node) => node === document.querySelector('[data-control]')),
				true
			);
			assert.equal(await input.inputValue(), 'user draft');
			assert.equal(await input.evaluate((node) => node === document.activeElement), true);
			assert.equal(
				await page.locator('[data-control]').getAttribute('data-package-tone'),
				enabled ? 'active' : null
			);
			await page.locator('[data-control]').click();
			await page.locator('[data-selected]').filter({ hasText: /^1$/ }).waitFor();
			await page.locator('[data-update]').click();
			await page.locator('[data-control]').filter({ hasText: 'Report 2' }).waitFor();
			assert.equal(
				await button.evaluate((node) => node === document.querySelector('[data-control]')),
				true
			);
			assert.equal(
				await row.evaluate((node) => node === document.querySelector('[data-row="b"]')),
				true
			);
			assert.equal(await row.textContent(), 'Report 2: Changed');
			assert.equal(await page.locator('[data-summary]').count(), 0);
			await page.locator('[data-removed]').filter({ hasText: /^a$/ }).waitFor();
			await page.locator('[data-control]').click();
			await page.locator('[data-selected]').filter({ hasText: /^2$/ }).waitFor();
			await page.locator('[data-remove]').click();
			await page.locator('[data-summary]').filter({ hasText: 'Report 3' }).waitFor();
			await page.locator('[data-removed]').filter({ hasText: /^ab$/ }).waitFor();
			assert.equal(await page.locator('[data-row]').count(), 0);
			await page.locator('[data-control]').click();
			assert.equal(await page.locator('[data-selected]').textContent(), '2');
			assert.equal(await input.inputValue(), 'user draft');
			assert.deepEqual(errors, []);
		} finally {
			release();
		}
		console.log(`  ${name}: repeated interaction, identity, form state, and cleanup passed`);
	} catch (error) {
		failed = true;
		await mkdir(evidence, { recursive: true });
		await context.tracing.stop({ path: path.join(evidence, `${name}.zip`) });
		throw new Error(`${name} failed; trace: ${path.join(evidence, `${name}.zip`)}`, {
			cause: error
		});
	} finally {
		try {
			if (!failed) await context.tracing.stop();
		} finally {
			await context.close();
		}
	}
}
