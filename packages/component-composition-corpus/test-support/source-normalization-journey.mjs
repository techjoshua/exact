import assert from 'node:assert/strict';

/** Verifies normalization, untracked snapshots and startup-only tasks across native hosts. */
export async function verifySourceNormalization(page) {
	assert.equal(await page.locator('#normalization-async-result').textContent(), '99:2');
	for (const expected of ['2 / 3', '3 / 4', '4 / 5']) {
		assert.equal(await page.locator('#normalization-result').textContent(), expected);
		assert.equal(
			await page.evaluate(
				() => window.originalNormalization === document.querySelector('#normalization-result')
			),
			true
		);
		if (expected !== '4 / 5') await page.click('#normalization-next');
	}
	for (const expected of ['1', '3', '6']) {
		await page.waitForFunction(
			(expected) =>
				document.querySelector('#normalization-snapshot-result')?.textContent === expected,
			expected
		);
		assert.equal(
			await page.evaluate(
				() => window.originalSnapshot === document.querySelector('#normalization-snapshot-result')
			),
			true
		);
		if (expected !== '6') await page.click('#normalization-snapshot-next');
	}
	for (const expected of ['2', '4', '6']) {
		await page.waitForFunction(
			(expected) =>
				document.querySelector('#normalization-helper-result')?.textContent === expected,
			expected
		);
		assert.equal(
			await page.evaluate(
				() =>
					window.originalHelperSnapshot === document.querySelector('#normalization-helper-result')
			),
			true
		);
		await page.click('#normalization-helper-snapshot');
		assert.equal(await page.locator('#normalization-helper-result').textContent(), expected);
		if (expected !== '6') await page.click('#normalization-helper-next');
	}
	await page.waitForFunction(
		() => document.querySelector('#normalization-startup-result')?.textContent === '2'
	);
	for (let step = 0; step < 3; step++) {
		await page.click('#normalization-startup-input');
		assert.equal(await page.locator('#normalization-startup-result').textContent(), '2');
		assert.equal(
			await page.evaluate(
				() => window.originalStartup === document.querySelector('#normalization-startup-result')
			),
			true
		);
	}
	for (const expected of ['2', '4', '6']) {
		try {
			await page.waitForFunction(
				(expected) =>
					document.querySelector('#normalization-server-snapshot-result')?.textContent === expected,
				expected
			);
		} catch (error) {
			throw new Error(
				`Server snapshot expected ${expected}, received ${await page.locator('#normalization-server-snapshot-result').textContent()}`,
				{ cause: error }
			);
		}

		await page.click('#normalization-server-snapshot-change');
		assert.equal(
			await page.locator('#normalization-server-snapshot-result').textContent(),
			expected
		);
		if (expected !== '6') await page.click('#normalization-server-snapshot-next');
	}
	for (const expected of ['2', '4', '6']) {
		await page.waitForFunction(
			(expected) =>
				document.querySelector('#normalization-async-input-result')?.textContent === expected,
			expected
		);
		if (expected !== '6') await page.click('#normalization-async-input-next');
	}
}
