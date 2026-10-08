import assert from 'node:assert/strict';

/** Checks that accepted ordinary JSON data survives browser script parsing. */
export async function checkSerializationScripts(page, scripts) {
	for (const { value, script } of scripts) {
		await page.setContent(script);
		assert.deepEqual(
			await page
				.locator('script')
				.evaluate((node) => JSON.parse(node.textContent).state.value),
			value
		);
	}
}

/** Verifies client validation rejects authored serialization hooks without invoking them. */
export async function checkBrowserJsonData(page) {
	const observed = await page.evaluate(() => {
		let calls = 0;
		const hook = () => {
			calls++;
			return Infinity;
		};
		const invalid = [
			Object.defineProperty({}, 'toJSON', { value: hook }),
			Object.defineProperty([], 'toJSON', { get: hook }),
			Object.defineProperty([0], '0', { get: hook, enumerable: false }),
			Object.defineProperty([0], '0', { value: Infinity, enumerable: false }),
			Object.defineProperty([0], Symbol.iterator, { get: hook }),
			Object.defineProperty(new Map([['safe', 1]]), Symbol.iterator, { get: hook }),
			Object.defineProperty(new Set([1]), Symbol.iterator, { get: hook })
		];
		return {
			rejected: invalid.map((value) => !window.validateRuntimeJsonData(value)),
			calls,
			sparse: window.validateRuntimeJsonData(new Array(3), { maxNodes: 4 }),
			limited: window.validateRuntimeJsonData(new Array(3), { maxNodes: 3 })
		};
	});
	assert.deepEqual(observed, {
		rejected: [true, true, true, true, true, true, true],
		calls: 0,
		sparse: true,
		limited: false
	});
}
