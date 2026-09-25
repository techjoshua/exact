import assert from 'node:assert/strict';

/** Captures SSR row identity and an edited input before the built client adopts them. */
export function captureKeyedSpreads(container) {
	return [...container.querySelectorAll('[data-keyed-spreads]')].map((host) => {
		assert.ok(host, 'keyed spread probe rendered');
		const rows = [...host.querySelectorAll('li')];
		assert.equal(rows.length, 2);
		const input = rows[0].querySelector('input');
		input.value = 'unsaved';
		return { host, rows, input };
	});
}

/** Runs the retained-row contract against each adapter's built server and client artifacts. */
export async function verifyKeyedSpreads(container, captured) {
	assert.equal(captured.length, 3);
	for (const [index, { host, rows, input }] of captured.entries()) {
		assert.equal(container.querySelectorAll('[data-keyed-spreads]')[index], host);
		assert.deepEqual([...host.querySelectorAll('li')], rows);
		const click = async (name) => {
			const button = [...host.querySelectorAll('button')].find((item) => item.textContent === name);
			assert.ok(button, name);
			button.click();
			await new Promise((resolve) => setTimeout(resolve, 0));
		};
		await click('Start');
		assert.equal(rows[0].dataset.status, 'running');
		assert.equal(rows[0].hasAttribute('title'), false);
		await click('Finish');
		assert.deepEqual(
			rows.map((row) => row.dataset.status),
			['done', 'done']
		);
		await click('Retry');
		assert.equal(rows[0].dataset.status, 'retried');
		await click('Reverse');
		assert.deepEqual([...host.querySelectorAll('li')], [...rows].reverse());
		assert.equal(rows[0].querySelector('input'), input);
		assert.equal(input.value, 'unsaved');
		await click('Clear');
		assert.equal(host.querySelectorAll('li').length, 0);
	}
	const derived = container.querySelector('[data-derived-state]');
	assert.ok(derived, 'derived state probe rendered');
	const output = derived.querySelector('output');
	assert.equal(output.textContent, 'Value 0!');
	for (const count of [1, 2]) {
		derived.querySelector('button').click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		assert.equal(derived.querySelector('output'), output);
		assert.equal(output.textContent, `Value ${count}!`);
		assert.equal(derived.querySelector('small').textContent, '0');
	}
}
