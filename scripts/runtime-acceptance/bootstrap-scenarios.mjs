import assert from 'node:assert/strict';

/** Checks bootstrap timing, ordering, CSP nonces, and native integrity enforcement on each host. */
export async function checkBootstrapLoading(origin, browser) {
	for (const stream of [false, true])
		for (const loading of [
			'after-load',
			'normal',
			'single',
			'single-nonce',
			'multiple-nonce',
			'integrity',
			'integrity-failure'
		]) {
			const page = await browser.newPage();
			const errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			const failed = loading === 'integrity-failure';
			const failure = failed ? page.waitForEvent('pageerror') : undefined;
			try {
				await page.goto(
					new URL(`/bootstrap-page?loading=${loading}${stream ? '&stream' : ''}`, origin).href
				);
				if (failed) {
					assert.match((await failure).message, /Failed to load bootstrap script/);
					assert.equal(await page.evaluate(() => window.bootstrapEvents), undefined);
					continue;
				}
				await page.waitForFunction(
					(count) => window.bootstrapEvents?.length === count,
					loading.startsWith('single') ? 1 : 2
				);
				const events = await page.evaluate(() => window.bootstrapEvents);
				assert.deepEqual(
					events.map((event) => event.part),
					loading.startsWith('single') ? ['first'] : ['first', 'second']
				);
				if (loading !== 'normal') assert.ok(events.every((event) => event.state === 'complete'));
				assert.deepEqual(errors, []);
			} finally {
				await page.close();
			}
		}
}
