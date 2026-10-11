import assert from 'node:assert/strict';

/** Checks buffered and streamed native output before browser parsing can hide URL differences. */
export function checkUrlPublication(results) {
	assert.equal(results.length, 8);
	for (const { first, html, calls } of results) {
		assert.equal(calls, 1);
		assert.doesNotMatch(html, /unchecked/);
		if (first.startsWith('/')) assert.match(html, /href="\/safe\?first=1&amp;second=2"/);
		else assert.match(html, /eXact has blocked a javascript:/);
	}
}

/** Checks real browser property coercion, retained updates and removal through the built provider. */
export async function checkBrowserUrlCoercion(page) {
	const observed = await page.evaluate(() => {
		const anchor = document.createElement('a');
		const values = [];
		for (const method of ['primitive', 'string']) {
			for (const first of ['/safe', 'javascript:probe', '/next']) {
				let calls = 0;
				const convert = () => (++calls === 1 ? first : 'javascript:unchecked');
				const value =
					method === 'primitive' ? { [Symbol.toPrimitive]: convert } : { toString: convert };
				window.applyRuntimeDomProp(anchor, 'href', value);
				values.push({ first, calls, href: anchor.getAttribute('href') });
			}
		}
		window.applyRuntimeDomProp(anchor, 'href', undefined);
		return { values, removed: !anchor.hasAttribute('href') };
	});
	assert.equal(observed.removed, true);
	for (const { first, calls, href } of observed.values) {
		assert.equal(calls, 1);
		if (first.startsWith('/')) assert.equal(href, first);
		else assert.match(href, /eXact has blocked a javascript:/);
	}
}
