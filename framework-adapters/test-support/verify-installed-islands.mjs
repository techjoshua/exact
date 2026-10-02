import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dom = new JSDOM('<!doctype html><body></body>', {
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
	'HTMLButtonElement',
	'SubmitEvent'
])
	globalThis[name] = dom.window[name];
let client;
try {
	const root = process.argv[2];
	const server = await import(pathToFileURL(path.join(root, 'out/server.mjs')).href);
	const browser = await import(pathToFileURL(path.join(root, 'out/client.mjs')).href);
	const rendered = await server.renderPage();
	const container = document.createElement('main');
	container.innerHTML = rendered.htmlWithHydration;
	assert.match(container.textContent, /Count 7/);
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
			return server.handleExact(new Request(new URL(request, 'http://localhost'), options));
		}
	});
	await client.whenSettled();
	assert.equal(container.querySelector('input'), input);
	assert.equal(input.value, 'Edited before hydration');
	assert.equal(container.querySelector('[data-row]'), initialRow);
	initialRow.click();
	await client.whenSettled();
	assert.equal(initialRow.textContent, '7:1');
	for (const value of [8, 9]) {
		container.querySelector('[data-increment]').click();
		await client.whenSettled();
		assert.equal(container.querySelector('[data-increment]').textContent, 'Count ' + value);
		assert.equal(container.querySelector('[data-row]'), initialRow);
		assert.equal(initialRow.textContent, value + ':1');
	}
	container.querySelector('[data-replace]').click();
	await client.whenSettled();
	// A lazy registry loader owns a separate asynchronous component candidate.
	for (let attempt = 0; attempt < 200 && !container.querySelector('[data-row]'); attempt++)
		await new Promise((resolve) => setTimeout(resolve, 5));
	const replacement = container.querySelector('[data-row]');
	assert.ok(replacement, 'Lazy replacement did not mount');
	assert.notEqual(replacement, initialRow);
	assert.equal(replacement.textContent, '9:0');
	replacement.click();
	await client.whenSettled();
	assert.equal(replacement.textContent, '9:1');
	container.querySelector('[data-increment]').click();
	await client.whenSettled();
	assert.equal(container.querySelector('[data-row]'), replacement);
	assert.equal(replacement.textContent, '10:1');
	assert.equal(calls, 4);
	assert.deepEqual(errors, []);
	client.dispose();
	client = undefined;
	const text = container.textContent;
	replacement.click();
	initialRow.click();
	assert.equal(container.textContent, text);
	assert.equal(calls, 4);
	assert.deepEqual(errors, []);
	console.log('Installed islands retained identity, dispatch, lazy replacement and cleanup');
} finally {
	client?.dispose();
	dom.window.close();
}
