import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startInstalledIslandsHttp } from './installed-islands-http.mjs';

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
let deployment;
try {
	const root = process.argv[2];
	const browser = await import(pathToFileURL(path.join(root, 'out/client.mjs')).href);
	if (process.argv[3]) deployment = { origin: process.argv[3] };
	else {
		const server = await import(pathToFileURL(path.join(root, 'out/server.mjs')).href);
		deployment = await startInstalledIslandsHttp(server);
	}
	const response = await fetch(deployment.origin);
	assert.equal(response.status, 200);
	const container = document.createElement('main');
	container.innerHTML = await response.text();
	assert.match(container.textContent, /Count 7/);
	assert.equal(container.querySelector('[data-utf8]').textContent, 'café 🙂');
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
	initialRow.click();
	await client.whenSettled();
	assert.equal(initialRow.textContent, '7:1');
	for (const value of [8, 9]) {
		container.querySelector('[data-increment]').click();
		await client.whenSettled();
		assert.equal(container.querySelector('[data-increment]').textContent, 'Count ' + value);
		assert.equal(container.querySelector('[data-row]'), initialRow);
		assert.equal(initialRow.textContent, value + ':1');
		assert.equal(initialRow.dataset.prefix, value % 2 ? 'Odd' : 'Row');
	}
	// Published child tasks retain their owner through props and lose it on key replacement.
	const firstTask = container.querySelector('[data-row-task]');
	firstTask.click();
	for (let attempt = 0; attempt < 200 && browser.rowWorkSignals().length < 1; attempt++)
		await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(browser.rowWorkSignals().length, 1);
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
	assert.equal(browser.rowWorkSignals()[0].aborted, true);
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
	assert.equal(replacement.dataset.prefix, 'Row');
	const secondTask = container.querySelector('[data-row-task]');
	secondTask.click();
	for (let attempt = 0; attempt < 200 && browser.rowWorkSignals().length < 2; attempt++)
		await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(browser.rowWorkSignals().length, 2);
	browser.releaseRowWork(1);
	await client.whenSettled();
	for (
		let attempt = 0;
		attempt < 200 && container.querySelector('[data-row-result]').textContent !== '10';
		attempt++
	)
		await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(container.querySelector('[data-row-result]').textContent, '10');
	secondTask.click();
	for (let attempt = 0; attempt < 200 && browser.rowWorkSignals().length < 3; attempt++)
		await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(browser.rowWorkSignals().length, 3);
	assert.equal(calls, 4);
	assert.deepEqual(errors, []);
	client.dispose();
	client = undefined;
	assert.equal(browser.rowWorkSignals()[2].aborted, true);
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
	const transport = process.argv[3]
		? await (await fetch(new URL('/__acceptance', deployment.origin))).json()
		: deployment;
	assert.deepEqual(transport.errors, []);
	assert.deepEqual(transport.requests, [
		{ method: 'GET', path: '/' },
		...Array.from({ length: 4 }, () => ({ method: 'POST', path: '/__exact' }))
	]);
	console.log('Installed islands retained identity, HTTP dispatch, lazy replacement and cleanup');
} finally {
	client?.dispose();
	dom.window.close();
	await deployment?.dispose?.();
}
