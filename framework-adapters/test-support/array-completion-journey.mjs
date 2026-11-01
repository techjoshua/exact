import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { composeExactExecutorContract } from '@exactjs/server';
import { createExactNodeHandler } from '@exactjs/node-adapter';

/** Runs real host-built client capture/application against real server HTTP dispatch.
 * JSON and stream submissions retain the Array and both initial records through a next interaction.
 */
export async function verifyArrayCompletionArtifacts(entries) {
	const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
	const { document } = dom.window;
	const restored = new Map();
	let server;
	const requests = [],
		responses = [],
		reports = [];
	try {
		for (const key of [
			'window',
			'document',
			'Node',
			'NodeFilter',
			'Element',
			'HTMLElement',
			'Text',
			'Comment',
			'HTMLInputElement',
			'HTMLTextAreaElement',
			'HTMLSelectElement',
			'HTMLOptionElement',
			'HTMLOptGroupElement',
			'HTMLFormElement',
			'HTMLButtonElement',
			'Document',
			'DocumentFragment',
			'ShadowRoot',
			'MutationObserver',
			'HTMLScriptElement'
		]) {
			restored.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
			if (dom.window[key])
				Object.defineProperty(globalThis, key, {
					configurable: true,
					writable: true,
					value: dom.window[key]
				});
		}
		const loaded = await import(pathToFileURL(path.resolve(entries.server)).href);
		const pages = loaded.RootDirect ? loaded : loaded.default;
		const contract = composeExactExecutorContract([
			pages.RootDirect,
			pages.RootHelper,
			pages.MemberHelper
		]);
		server = createServer(
			createExactNodeHandler({ contract, logger: { log: (report) => reports.push(report) } })
		);
		await new Promise((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		const endpoint = 'http://127.0.0.1:' + server.address().port + '/__exact';
		const imported = await import(pathToFileURL(path.resolve(entries.client)).href);
		const fixture = imported.start ? imported : imported.default;
		for (const stream of [false, true]) {
			const state = { rows: [{ label: 'A' }, { label: 'B' }] },
				rows = state.rows,
				[a, b] = rows;
			const container = document.createElement('main');
			document.body.append(container);
			const client = fixture.start(
				container,
				state,
				endpoint,
				async (url, init) => {
					requests.push(JSON.parse(init.body));
					const response = await fetch(url, init);
					responses.push({ status: response.status, body: await response.clone().text(), stream });
					return response;
				},
				reports,
				stream
			);
			try {
				for (const [name, labels] of [
					['RootDirect', ['A', 'B', 'added']],
					['RootHelper', ['A', 'B', 'added', 'added']],
					['MemberHelper', ['changed', 'B', 'added', 'added']],
					['RootDirect', ['changed', 'B', 'added', 'added', 'added']]
				]) {
					const result = await client.invokeTask(fixture.ids[name], { dependencies: [] });
					assert.equal(result.arrayCompletion, 4);
					if (name !== 'MemberHelper') {
						assert.equal(result.state, undefined);
						assert.ok(
							result.mutations.some(
								(value) => value.operation === 'array-net' && value.path === 'rows'
							)
						);
					}
					assert.equal(state.rows, rows);
					assert.equal(state.rows[0], a);
					assert.equal(state.rows[1], b);
					assert.deepEqual(
						rows.map((row) => row.label),
						labels
					);
					assert.equal(client.pendingRequests, 0);
				}
			} finally {
				client.dispose();
				container.remove();
			}
			const count = requests.length;
			await assert.rejects(
				client.invokeTask(fixture.ids.RootDirect, { dependencies: [] }),
				/disposed/
			);
			assert.equal(requests.length, count);
			assert.equal(container.isConnected, false);
		}
		assert.equal(requests.length, 8);
		assert.ok(requests.every((value) => value.arrayCompletion === 4));
		assert.ok(responses.every((value) => value.status === 200));
		assert.deepEqual(reports, []);
		console.log(JSON.stringify({ requests: requests.length, streams: 2, verified: true }));
	} catch (error) {
		console.error(JSON.stringify({ requests, responses, reports }));
		throw error;
	} finally {
		if (server) {
			server.closeAllConnections();
			if (server.listening)
				await new Promise((resolve, reject) =>
					server.close((error) => (error ? reject(error) : resolve()))
				);
		}
		dom.window.close();
		for (const [key, descriptor] of restored)
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else delete globalThis[key];
	}
}
