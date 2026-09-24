import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

// Each built application owns its reactive runtime. Evaluate each comparison in a fresh realm
// so registrations from an earlier bundle cannot supply or mask missing integration.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
	url: 'http://localhost/',
	pretendToBeVisual: true
});
for (const name of [
	'window',
	'document',
	'Node',
	'Element',
	'HTMLElement',
	'HTMLScriptElement',
	'HTMLInputElement',
	'HTMLTextAreaElement',
	'HTMLSelectElement',
	'HTMLFormElement',
	'DocumentFragment',
	'Text',
	'Comment',
	'MutationObserver',
	'Event',
	'CustomEvent',
	'MouseEvent',
	'KeyboardEvent',
	'DOMParser',
	'ShadowRoot',
	'HTMLTemplateElement',
	'HTMLButtonElement'
])
	globalThis[name] = dom.window[name];
let mounted;
try {
	const root = process.argv[2];
	const server = await import(pathToFileURL(path.join(root, 'out/server.mjs')).href);
	const client = await import(pathToFileURL(path.join(root, 'out/client.mjs')).href);
	const rendered = await server.renderPage();
	let container;
	if (process.argv[3] === 'shell') {
		document.documentElement.innerHTML = new DOMParser().parseFromString(
			rendered.htmlWithHydration,
			'text/html'
		).documentElement.innerHTML;
		container = document.getElementById('app');
	} else {
		container = document.createElement('main');
		container.innerHTML = rendered.htmlWithHydration;
	}
	assert.equal(container.querySelector('strong')?.textContent, '7');
	assert.equal(container.querySelector('p')?.textContent, 'panel');
	assert.equal(container.querySelector('li')?.textContent, 'finding');
	const strong = container.querySelector('strong');
	let invocations = 0;
	mounted = client.mountPage(
		container,
		server.handleExact
			? {
					fetch: async (input, init) => {
						invocations++;
						return server.handleExact(new Request(new URL(input, 'http://localhost/'), init));
					}
				}
			: undefined
	);
	await mounted.whenSettled();
	assert.equal(container.querySelector('strong'), strong);
	container.querySelector('button').click();
	for (let tick = 0; tick < 100 && strong.textContent !== '8'; tick++) {
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	assert.equal(strong.textContent, '8');
	container.querySelector('button').click();
	for (let tick = 0; tick < 100 && strong.textContent !== '9'; tick++) {
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	assert.equal(strong.textContent, '9');
	if (server.handleExact) assert.equal(invocations, 2);
	assert.equal(container.querySelector('strong'), strong);
	const button = container.querySelector('button');
	mounted.dispose();
	mounted = undefined;
	button.click();
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(strong.textContent, '9');
} finally {
	mounted?.dispose();
	dom.window.close();
}
