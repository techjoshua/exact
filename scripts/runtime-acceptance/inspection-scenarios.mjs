import { createExactClientInspectionQueryService } from '../../packages/devtools-runtime/dist/query-service.js';
import { createExactClientEventStore } from '../../packages/devtools-runtime/dist/client-events.js';
import { createExactBrowserServerInspectionClient } from '../../packages/devtools-runtime/dist/server-client.js';
import assert from 'node:assert/strict';

/** Bounds every owned inspection request, including transport-injected requests. */
const fetch = (url, options = {}) =>
	globalThis.fetch(url, { signal: AbortSignal.timeout(10000), ...options });

/** Checks authorized native inspection, envelope validation, root filters, and merged transport pages. */
export async function checkNativeInspection(origin) {
	assert.deepEqual(await (await fetch(new URL('/inspection-response-encoding', origin))).json(), {
		ok: true
	});
	assert.deepEqual(
		await (await fetch(new URL('/inspection-catalog', origin))).json(),
		Array(21).fill(true)
	);
	assert.deepEqual(
		await (await fetch(new URL('/inspection-responses', origin))).json(),
		Array(9).fill(true)
	);
	assert.deepEqual(
		await (await fetch(new URL('/inspection-preview', origin))).json(),
		Array(17).fill(true)
	);
	for (const [browserOrigin, status] of [
		['https://evil.invalid', 404],
		['https://trusted.invalid', 200]
	]) {
		const response = await fetch(new URL('/debug-origin', origin), {
			method: 'POST',
			headers: { origin: browserOrigin, 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'debug', version: 1, request: 'open' })
		});
		assert.equal(response.status, status, 'Debug origins use configured browser authority');
	}

	const debug = async (body) => {
		const response = await fetch(new URL('/debug-origin', origin), {
			method: 'POST',
			headers: { origin: 'https://trusted.invalid', 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'debug', version: 1, ...body })
		});
		assert.equal(response.status, 200);
		return response.json();
	};
	const opened = await debug({ request: 'open', capabilities: ['catalog'] });
	try {
		for (const malformed of [
			{ request: 'open', id: 'operation', payload: {} },
			{ request: 'open', capabilities: [['catalog']] },
			{ request: ['close'], sessionId: opened.session.id },
			{
				request: 'query',
				sessionId: opened.session.id,
				query: { protocol: 1, id: 'roots', method: 'roots.list', evaluate: 'caller-code' }
			}
		]) {
			const response = await fetch(new URL('/debug-origin', origin), {
				method: 'POST',
				headers: { origin: 'https://trusted.invalid', 'content-type': 'application/json' },
				body: JSON.stringify({ type: 'debug', version: 1, ...malformed })
			});
			assert.equal(response.status, 400, 'Malformed debug and query envelopes are rejected');
		}
		for (const [filter, count] of [
			[{ side: 'server', executionRoot: 'selected' }, 1],
			[{ side: 'client' }, 0],
			[{ buildKey: 'missing' }, 0],
			[{ executionRoot: 'missing' }, 0]
		]) {
			const response = await debug({
				request: 'query',
				sessionId: opened.session.id,
				query: {
					protocol: 1,
					id: 'roots',
					method: 'roots.list',
					params: { filter, page: { limit: 1 } }
				}
			});
			assert.equal(response.ok, true);
			assert.equal(response.result.length, count);
			if (count) assert.equal(response.result[0].executionRoot, 'selected');
		}
	} finally {
		await debug({ request: 'close', sessionId: opened.session.id });
	}

	const client = createExactBrowserServerInspectionClient(
		new URL('/debug-origin', origin).href,
		(url, options) => {
			const headers = new Headers(options.headers);
			headers.set('origin', 'https://trusted.invalid');
			return fetch(url, { ...options, headers });
		}
	);
	const attached = await client.open(['catalog', 'snapshot']);
	assert.ok(attached, 'The built transport accepts the native server session');
	try {
		const response = await client.query(attached.id, {
			protocol: 1,
			id: 'transport-roots',
			method: 'roots.list',
			params: { filter: { executionRoot: 'selected' } }
		});
		assert.equal(response.ok, true);
		assert.equal(response.identity.sessionId, attached.id);
		assert.equal(response.result.length, 1);
		assert.equal(response.result[0].executionRoot, 'selected');
		const merged = createExactClientInspectionQueryService({
			sessionId: attached.id,
			serverConnected: true,
			server: client,
			events: createExactClientEventStore(100, 100000),
			dom: {
				attach() {},
				detach() {},
				ownerOfElement: () => undefined,
				ownedElements: () => [],
				snapshot: () => ({
					roots: [
						{
							side: 'client',
							buildKey: 'browser-build',
							executionRoot: 'browser',
							status: 'available',
							components: 0
						}
					],
					components: [],
					partitions: []
				})
			}
		});
		const first = await merged.request({
			protocol: 1,
			id: 'merged-first',
			method: 'roots.list',
			params: { page: { limit: 2 } }
		});
		assert.equal(first.ok, true);
		assert.deepEqual(
			first.result.map((root) => root.executionRoot),
			['browser', 'first']
		);
		assert.ok(first.page.nextCursor);
		const second = await merged.request({
			protocol: 1,
			id: 'merged-next',
			method: 'roots.list',
			params: { page: { limit: 2, cursor: first.page.nextCursor } }
		});
		assert.equal(second.ok, true);
		assert.deepEqual(
			second.result.map((root) => root.executionRoot),
			['selected']
		);
		assert.equal(second.page?.nextCursor, undefined);
	} finally {
		await client.close(attached.id);
	}
}
