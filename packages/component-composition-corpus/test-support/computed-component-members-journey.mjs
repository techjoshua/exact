import assert from 'node:assert/strict';

/** Checks finite operation identity and ordinary receiver behavior through native hydration. */
export async function verifyComputedComponentMembers(page) {
	const probes = [
		['computed-owned-members', 0],
		['computed-ref-members', 0],
		['computed-reactive-members', 1],
		['ordinary-receiver-members', 14]
	];
	await page.evaluate(() => {
		window.computedMemberNodes = [
			'computed-owned-members',
			'computed-ref-members',
			'computed-reactive-members',
			'ordinary-receiver-members'
		].map((id) => document.querySelector('#' + id + ' output'));
	});
	for (const [id, initial] of probes) {
		for (let step = 0; step < 3; step++) {
			await page.waitForFunction(
				({ id, value }) =>
					document.querySelector('#' + id + ' output')?.textContent === String(value),
				{ id, value: initial + step }
			);
			if (step < 2) await page.click('#' + id + ' button');
		}
	}
	assert.equal(
		await page.evaluate(() =>
			window.computedMemberNodes.every(
				(node) => node === node.closest('div[id]').querySelector('output')
			)
		),
		true
	);
	await page.evaluate(() => {
		window.ownedProtocolNodes = ['owned-protocol', 'owned-spread'].map((name) =>
			document.querySelector('[data-partition="' + name + '"]')
		);
	});
	for (const [name, initial] of [
		['owned-protocol', 2],
		['owned-spread', 0]
	]) {
		for (let step = 0; step < 3; step++) {
			await page.waitForFunction(
				({ name, value }) =>
					document.querySelector('[data-partition="' + name + '"]')?.textContent === String(value),
				{ name, value: initial + step }
			);
			if (step < 2) await page.click('[data-partition="' + name + '"]');
		}
	}
	assert.equal(
		await page.evaluate(() =>
			window.ownedProtocolNodes.every(
				(node) =>
					document.querySelector(
						'[data-partition="' + node.getAttribute('data-partition') + '"]'
					) === node
			)
		),
		true
	);
	const trace = await page.evaluate(() => window.computedMemberTrace());
	assert.equal(trace.filter((value) => value === 'key').length, 1);
	assert.equal(trace.filter((value) => value === 'created').length, 1);
	assert.ok(trace.indexOf('key') < trace.indexOf('created'));
	assert.equal(trace.filter((value) => value === 'mounted').length, 1);
	assert.equal(trace.filter((value) => value === 'ref-ready').length, 1);
	assert.equal(trace.includes('ref-missing'), false);
	assert.equal(trace.includes('disposed'), false);
}

/** Confirms each durable resource and final lifecycle registration releases exactly once. */
export async function verifyComputedMemberDisposal(page) {
	await page.evaluate(() => window.runtimeClient.dispose());
	const trace = await page.evaluate(() => window.computedMemberTrace());
	assert.equal(trace.filter((value) => value === 'disposed').length, 1);
	assert.equal(trace.filter((value) => value === 'unmounted').length, 1);
	assert.deepEqual(
		await page.evaluate(() => {
			window.ownedProtocolNodes.forEach((node) => node.click());
			return window.ownedProtocolNodes.map((node) => node.textContent);
		}),
		['4', '2']
	);
}
