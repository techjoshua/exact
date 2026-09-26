import assert from 'node:assert/strict';
import { request, json } from './test-support.mjs';

/** Verifies native SSR output, DOM adoption, repeated remote updates and client disposal. */
export async function checkHydration(origin, browser, control) {
	// The gate opens only after bytes arrive, so buffered rendering cannot pass this witness.
	const streamed = await request(new URL('/stream-page?gate=ssr', origin));
	assert.equal(streamed.status, 200);
	const reader = streamed.body.getReader();
	try {
		const first = await reader.read();
		assert.equal(first.done, false, 'SSR shell must precede delayed server work');
		assert.ok(first.value.byteLength > 0);
		const pending = await json(await request(new URL('/page-state', origin)));
		assert.ok(pending.created.includes('ssr'));
		assert.equal(
			pending.disposed.some((value) => value.id === 'ssr'),
			false,
			'Pending SSR must retain its request scope'
		);
		await (await request(new URL('/release?id=ssr', control))).text();
		let html = new TextDecoder().decode(first.value);
		const decoder = new TextDecoder();
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			html += decoder.decode(next.value, { stream: true });
		}
		html += decoder.decode();
		assert.match(html, /id="server-delayed"/);
		assert.match(html, /__exact_hydration/);
	} finally {
		await reader.cancel();
		reader.releaseLock();
	}

	for (const route of ['/page', '/stream-page', '/committed-page']) {
		const response = await request(new URL(route, origin));
		const html = await response.text();
		assert.equal(response.status, 200, html);
		assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt; café 😀/);
		assert.match(html, /__exact_hydration/);
		assert.doesNotMatch(html, /<script>unsafe<\/script>/);
		assert.match(html, /title="settled"/);
		assert.doesNotMatch(html, /title="\[object Object\]"/);
		const page = await browser.newPage();
		const errors = [];
		let requests = 0;
		page.on('request', (request) => {
			if (new URL(request.url()).pathname === '/__exact') requests++;
		});
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		page.setDefaultTimeout(10000);
		try {
			await page.goto(new URL(route, origin).href);
			await page.evaluate(() => {
				window.originalCounter = document.querySelector('#count');
				window.originalInput = document.querySelector('#draft');
				window.originalInput.value = 'edited before hydration';
			});
			await page.addScriptTag({ url: new URL('/client.js', origin).href, type: 'module' });
			await page.waitForFunction(() => window.runtimeClient);
			assert.equal(await page.locator('#map-total').textContent(), '0');
			assert.equal(await page.locator('#set-size').textContent(), '1');
			assert.equal(await page.locator('#settled-target').getAttribute('title'), 'settled');
			for (const count of [1, 2]) {
				const completed = page.waitForResponse(
					(response) => new URL(response.url()).pathname === '/__exact'
				);
				await page.click('#increment');
				const response = await completed;
				assert.equal(response.status(), 200, await response.text());
				await page.waitForFunction(
					(expected) => document.querySelector('#count').textContent === String(expected),
					count
				);
				assert.equal(await page.locator('#map-total').textContent(), String(count));
				assert.equal(await page.locator('#set-size').textContent(), '2');
			}
			assert.equal(
				await page.evaluate(() => window.originalCounter === document.querySelector('#count')),
				true,
				'Hydration and updates must preserve DOM identity'
			);
			assert.equal(await page.inputValue('#draft'), 'edited before hydration');
			assert.equal(
				await page.evaluate(() => window.originalInput === document.querySelector('#draft')),
				true
			);
			await page.evaluate(() => {
				const retiredButton = document.querySelector('#increment');
				window.runtimeClient.dispose();
				retiredButton.click();
			});
			await page.waitForTimeout(50);
			assert.equal(
				await page.locator('#count').count(),
				0,
				'Disposal must release the mounted DOM'
			);
			assert.equal(requests, 2, 'Disposal must remove interaction ownership');
			assert.deepEqual(errors, []);
		} catch (error) {
			throw new Error(route + ': ' + errors.join('; '), { cause: error });
		} finally {
			await page.close();
		}
	}
	const scopes = await json(await request(new URL('/page-state', origin)));
	assert.equal(
		scopes.created.length,
		scopes.disposed.length,
		'Completed SSR must release its request scopes'
	);
}
