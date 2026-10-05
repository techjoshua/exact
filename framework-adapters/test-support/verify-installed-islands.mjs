import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyInstalledOwnerJourney } from './installed-owner-journey.mjs';
import { startInstalledIslandsHttp } from './installed-islands-http.mjs';

const dom = new JSDOM('<!doctype html><body></body>', {
	url: 'http://localhost/',
	pretendToBeVisual: true
});
// Keep native EventTarget, Event and AbortSignal in one realm for the resource
// probe. Element APIs produce their own jsdom events without these globals.
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
	await verifyInstalledOwnerJourney(browser, deployment.origin);
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
