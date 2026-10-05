/** Shared observable ownership assertions for installed bundles in jsdom and Chromium. */
export async function verifyInstalledOwnerJourney(browser, origin) {
	const assert = {
		equal(actual, expected, message) {
			if (actual !== expected)
				throw new Error(message ?? `Expected ${String(expected)}, received ${String(actual)}`);
		},
		notEqual(actual, expected, message) {
			if (actual === expected)
				throw new Error(message ?? 'Owner identity was retained unexpectedly');
		},
		deepEqual(actual, expected) {
			if (JSON.stringify(actual) !== JSON.stringify(expected))
				throw new Error('Unexpected framework reports');
		},
		ok(value, message) {
			if (!value) throw new Error(message ?? 'Expected a value');
		},
		match(value, pattern) {
			if (!pattern.test(value)) throw new Error('Missing server rendered content');
		}
	};
	const rangeLabel = (end) =>
		new Intl.NumberFormat('en-US').formatRange(7, end) +
		' / ' +
		new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			currencyDisplay: 'code'
		}).formatRange(7, end);
	const deployment = { origin };
	let client;
	let container;
	try {
		const response = await fetch(deployment.origin);
		assert.equal(response.status, 200);
		container = document.createElement('main');
		container.innerHTML = await response.text();
		document.body.append(container);
		assert.match(container.textContent, /Count 7/);
		assert.equal(container.querySelector('[data-utf8]').textContent, 'café 🙂');
		const counter = container.querySelector('article');
		assert.equal(counter.getAttribute('class'), 'counter 1 2');
		const input = container.querySelector('input');
		input.value = 'Edited before hydration';
		const initialRow = container.querySelector('[data-row]');
		const errors = [];
		let calls = 0;
		client = browser.mountPage(container, {
			onErrorReport: (report) => errors.push(report),
			onDiagnostic: (diagnostic) => errors.push(diagnostic),
			fetch: async (request, options) => {
				calls++;
				return fetch(new URL(request, deployment.origin), options);
			}
		});
		await client.whenSettled();
		assert.equal(container.querySelector('input'), input);
		assert.equal(input.value, 'Edited before hydration');
		assert.equal(container.querySelector('[data-row]'), initialRow);
		assert.equal(initialRow.dataset.prefix, 'Odd');
		assert.equal(initialRow.dataset.snapshot, '7');
		assert.equal(initialRow.dataset.namespaceSnapshot, '7');
		assert.equal(initialRow.dataset.alias, '14');
		assert.equal(initialRow.dataset.live, '7');
		assert.equal(initialRow.dataset.range, rangeLabel(7));
		assert.equal(initialRow.dataset.optionalLocale, undefined);
		assert.equal(container.querySelector('article'), counter);
		assert.equal(counter.getAttribute('class'), 'counter 1 2');
		initialRow.click();
		await client.whenSettled();
		assert.equal(initialRow.textContent, '7:1');
		for (const value of [8, 9]) {
			container.querySelector('[data-increment]').click();
			await client.whenSettled();
			assert.equal(container.querySelector('[data-increment]').textContent, 'Count ' + value);
			assert.equal(container.querySelector('[data-row]'), initialRow);
			assert.equal(initialRow.textContent, value + ':1');
			assert.equal(initialRow.dataset.seed, String(value));
			assert.equal(initialRow.dataset.snapshot, '7');
			assert.equal(initialRow.dataset.namespaceSnapshot, '7');
			assert.equal(initialRow.dataset.alias, String(value * 2));
			assert.equal(initialRow.dataset.live, String(value));
			assert.equal(initialRow.dataset.range, rangeLabel(value));
			assert.equal(
				initialRow.dataset.optionalLocale,
				value % 2 === 0 ? new Date(0).toLocaleString('en-US', { timeZone: 'UTC' }) : undefined
			);
			assert.equal(container.querySelector('article'), counter);
			assert.equal(counter.getAttribute('class'), value % 2 ? 'counter 1 2' : 'counter');
			assert.equal(initialRow.dataset.prefix, value % 2 ? 'Odd' : 'Row');
		}
		// Published child tasks retain their owner through props and lose it on key replacement.
		const firstTask = container.querySelector('[data-row-task]');
		firstTask.click();
		for (let attempt = 0; attempt < 200 && browser.rowWorkSignals().length < 1; attempt++)
			await new Promise((resolve) => setTimeout(resolve, 5));
		assert.equal(browser.rowWorkSignals().length, 1);
		browser.dispatchRowWorkEvent();
		assert.equal(browser.rowWorkEvents(), 1);
		assert.equal(browser.rowResourceReleases(), 1);
		assert.equal(browser.rowFallbackResourceReleases(), 1);
		assert.equal(browser.rowLexicalResourceReleases(), 0);
		assert.equal(container.querySelector('[data-row-result]').textContent, 'idle');
		container.querySelector('[data-replace]').click();
		await client.whenSettled();
		// A lazy registry loader owns a separate asynchronous component candidate.
		for (let attempt = 0; attempt < 200 && !container.querySelector('[data-row]'); attempt++)
			await new Promise((resolve) => setTimeout(resolve, 5));
		const replacement = container.querySelector('[data-row]');
		assert.ok(replacement, 'Lazy replacement did not mount');
		assert.notEqual(replacement, initialRow);
		assert.equal(replacement.textContent, '9:0');
		assert.equal(replacement.dataset.snapshot, '9');
		assert.equal(replacement.dataset.namespaceSnapshot, '9');
		assert.equal(replacement.dataset.range, rangeLabel(9));
		assert.equal(replacement.dataset.optionalLocale, undefined);
		assert.equal(browser.rowWorkSignals()[0].aborted, true);
		browser.dispatchRowWorkEvent();
		assert.equal(browser.rowWorkEvents(), 1);
		assert.equal(browser.rowResourceReleases(), 2);
		assert.equal(browser.rowFallbackResourceReleases(), 2);
		assert.equal(browser.rowLexicalResourceReleases(), 1);
		browser.releaseRowWork(0);
		await client.whenSettled();
		assert.equal(container.querySelector('[data-row-result]').textContent, 'idle');
		firstTask.click();
		assert.equal(browser.rowWorkSignals().length, 1);
		replacement.click();
		await client.whenSettled();
		assert.equal(replacement.textContent, '9:1');
		container.querySelector('[data-increment]').click();
		await client.whenSettled();
		assert.equal(container.querySelector('[data-row]'), replacement);
		assert.equal(replacement.textContent, '10:1');
		assert.equal(replacement.dataset.snapshot, '9');
		assert.equal(replacement.dataset.namespaceSnapshot, '9');
		assert.equal(replacement.dataset.alias, '20');
		assert.equal(replacement.dataset.live, '10');
		assert.equal(replacement.dataset.range, rangeLabel(10));
		assert.equal(
			replacement.dataset.optionalLocale,
			new Date(0).toLocaleString('en-US', { timeZone: 'UTC' })
		);
		assert.equal(replacement.dataset.prefix, 'Row');
		const secondTask = container.querySelector('[data-row-task]');
		secondTask.click();
		for (let attempt = 0; attempt < 200 && browser.rowWorkSignals().length < 2; attempt++)
			await new Promise((resolve) => setTimeout(resolve, 5));
		assert.equal(browser.rowWorkSignals().length, 2);
		browser.dispatchRowWorkEvent();
		assert.equal(browser.rowWorkEvents(), 2);
		assert.equal(browser.rowResourceReleases(), 3);
		assert.equal(browser.rowFallbackResourceReleases(), 3);
		assert.equal(browser.rowLexicalResourceReleases(), 1);
		browser.releaseRowWork(1);
		await client.whenSettled();
		for (
			let attempt = 0;
			attempt < 200 && container.querySelector('[data-row-result]').textContent !== '10';
			attempt++
		)
			await new Promise((resolve) => setTimeout(resolve, 5));
		assert.equal(container.querySelector('[data-row-result]').textContent, '10');
		browser.dispatchRowWorkEvent();
		assert.equal(browser.rowWorkEvents(), 2);
		assert.equal(browser.rowResourceReleases(), 4);
		assert.equal(browser.rowFallbackResourceReleases(), 4);
		assert.equal(browser.rowLexicalResourceReleases(), 2);
		secondTask.click();
		for (let attempt = 0; attempt < 200 && browser.rowWorkSignals().length < 3; attempt++)
			await new Promise((resolve) => setTimeout(resolve, 5));
		assert.equal(browser.rowWorkSignals().length, 3);
		browser.dispatchRowWorkEvent();
		assert.equal(browser.rowWorkEvents(), 3);
		assert.equal(browser.rowResourceReleases(), 5);
		assert.equal(browser.rowFallbackResourceReleases(), 5);
		assert.equal(browser.rowLexicalResourceReleases(), 2);
		assert.equal(calls, 4);
		assert.deepEqual(errors, []);
		client.dispose();
		client = undefined;
		assert.equal(browser.rowWorkSignals()[2].aborted, true);
		browser.dispatchRowWorkEvent();
		assert.equal(browser.rowWorkEvents(), 3);
		for (let attempt = 0; attempt < 200 && browser.rowResourceReleases() !== 6; attempt++)
			await new Promise((resolve) => setTimeout(resolve, 5));
		assert.equal(browser.rowResourceReleases(), 6);
		assert.equal(browser.rowFallbackResourceReleases(), 6);
		assert.equal(browser.rowLexicalResourceReleases(), 3);
		browser.releaseRowWork(2);
		await new Promise((resolve) => setTimeout(resolve, 0));
		const text = container.textContent;
		replacement.click();
		initialRow.click();
		secondTask.click();
		assert.equal(browser.rowWorkSignals().length, 3);
		assert.equal(container.textContent, text);
		assert.equal(calls, 4);
		assert.deepEqual(errors, []);
	} finally {
		client?.dispose();
		container?.remove();
	}
}
