import assert from 'node:assert/strict';
import test from 'node:test';
import { startBunEntryHost } from '../src/ssr-bun-entry-host.mjs';

function fakeBun(context) {
	const previous = globalThis.Bun;
	let config;
	const stops = [];
	const listener = {
		port: 1234,
		stop(force) {
			stops.push(force);
		}
	};
	const serve = (value) => {
		config = value;
		return listener;
	};
	globalThis.Bun = { serve };
	context.after(() => {
		if (previous === undefined) delete globalThis.Bun;
		else globalThis.Bun = previous;
	});
	return {
		serve,
		listener,
		stops,
		get config() {
			return config;
		}
	};
}

test('native entry hosting preserves adapter options and request context and restores globalThis.Bun.serve', async (context) => {
	const bun = fakeBun(context);
	let handle;
	const host = await startBunEntryHost({
		port: 1234,
		installFetchHandler(value) {
			handle = value;
		},
		handleFetchControl: () => new Response('control'),
		handleFetchRequest: (request, server) => handle(request, server),
		async loadEntry() {
			globalThis.Bun.serve({
				idleTimeout: 17,
				fetch(request, server) {
					assert.equal(server, bun.listener);
					return new Response(new URL(request.url).pathname);
				}
			});
		}
	});
	assert.equal(globalThis.Bun.serve, bun.serve);
	assert.equal(bun.config.idleTimeout, 17);
	assert.equal(bun.config.hostname, '127.0.0.1');
	assert.equal(
		await (await bun.config.fetch(new Request('http://localhost/work'), bun.listener)).text(),
		'/work'
	);
	assert.equal(
		await (
			await bun.config.fetch(
				new Request('http://localhost/__exact-benchmark/telemetry'),
				bun.listener
			)
		).text(),
		'control'
	);
	await host.close();
	assert.deepEqual(bun.stops, [undefined]);
});

test('failed native startup stops its listener and always restores the serve hook', async (context) => {
	const bun = fakeBun(context);
	await assert.rejects(
		startBunEntryHost({
			port: 1234,
			installFetchHandler() {},
			async loadEntry() {
				globalThis.Bun.serve({ fetch() {} });
				throw new Error('startup failed');
			}
		}),
		/startup failed/
	);
	assert.equal(globalThis.Bun.serve, bun.serve);
	assert.deepEqual(bun.stops, [true]);
});

test('native entry hosting rejects routes that bypass measurement and entries without a listener', async (context) => {
	const bun = fakeBun(context);
	await assert.rejects(
		startBunEntryHost({
			loadEntry: async () => {
				globalThis.Bun.serve({ routes: { '/': new Response('bypass') }, fetch() {} });
			}
		}),
		/complete workload/
	);
	await assert.rejects(
		startBunEntryHost({ loadEntry: async () => {} }),
		/did not create a listener/
	);
	assert.equal(globalThis.Bun.serve, bun.serve);
});
