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
	'HTMLButtonElement',
	'SubmitEvent'
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
	const serverContent = container.querySelector('[data-server-content]');
	const input = serverContent?.querySelector('input');
	if (server.wrapperKind) assert.ok(serverContent);
	const nested = serverContent?.querySelector('[data-nested]');
	if (input) input.value = 'Edited before hydration';
	const scope = container.querySelector('[data-exact-theme-appearance]');
	if (server.wrapperKind && server.wrapperKind !== 'fragment') assert.ok(scope);
	if (scope) assert.equal(scope.getAttribute('data-exact-theme-appearance'), 'light');
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
	if (nested) {
		nested.click();
		await waitForText(nested, 'Nested 1');
	}
	if (scope) assert.equal(scope.getAttribute('data-exact-theme-appearance'), 'dark');
	container.querySelector('button').click();
	for (let tick = 0; tick < 100 && strong.textContent !== '9'; tick++) {
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	assert.equal(strong.textContent, '9');
	if (scope) {
		assert.equal(container.querySelector('[data-exact-theme-appearance]'), scope);
		assert.equal(scope.getAttribute('data-exact-theme-appearance'), 'light');
	}
	if (serverContent) {
		assert.equal(container.querySelector('[data-server-content]'), serverContent);
		assert.equal(serverContent.querySelector('input'), input);
		assert.equal(input.value, 'Edited before hydration');
		assert.equal(serverContent.querySelector('[data-nested]'), nested);
		nested.click();
		await waitForText(nested, 'Nested 2');
		assert.equal(container.querySelector('button').textContent, 'Add 9');
	}
	if (server.handleExact) assert.equal(invocations, 2);
	assert.equal(container.querySelector('strong'), strong);
	const button = container.querySelector('button');
	mounted.dispose();
	mounted = undefined;
	button.click();
	nested?.click();
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(strong.textContent, '9');
	if (nested) assert.equal(nested.textContent, 'Nested 2');
} finally {
	mounted?.dispose();
	dom.window.close();
}

/** Bounds asynchronous island loading and continuation settlement without assuming host speed. */
async function waitForText(element, expected) {
	for (let tick = 0; tick < 100 && element.textContent !== expected; tick++) {
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	assert.equal(element.textContent, expected);
}
