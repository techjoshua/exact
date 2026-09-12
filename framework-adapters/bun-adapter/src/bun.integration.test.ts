import {
	createExactAsyncProducedResponse,
	createExactBufferedResponse,
	defineExactOperationContract,
	exactResponseBodyOf
} from '@exactjs/server';
import {
	createBunRequestHandler,
	createExactBunHandler,
	exactResponseToBunResponse
} from './index.js';

import { monitorEventLoopDelay } from 'node:perf_hooks';
import { BunEventLoopObserver } from './event-loop-observer.js';

type SharedTestApi = Pick<typeof import('vitest'), 'describe' | 'it' | 'expect'>;

const runningInBun = Boolean((globalThis as { Bun?: unknown }).Bun);
const bunTestModule: string = 'bun:test';
const testApi = (
	runningInBun ? await import(bunTestModule) : await import('vitest')
) as SharedTestApi;
const describeBun = runningInBun ? testApi.describe : testApi.describe.skip;

describeBun('@exactjs/bun-adapter with Bun.serve', () => {
	testApi.it('keeps application monitoring active after a busy host becomes idle', async () => {
		const native = monitorEventLoopDelay({ resolution: 1 });
		const server = bunRuntime().serve({
			port: 0,
			fetch: createBunRequestHandler(() => new Response('ready'))
		});
		native.enable();
		try {
			await Promise.all(Array.from({ length: 8 }, async () => (await fetch(server.url)).text()));
			await new Promise((resolve) => setTimeout(resolve, 800));
			native.reset();
			await new Promise((resolve) => setTimeout(resolve, 30));
			testApi.expect(native.count).toBeGreaterThan(0);
		} finally {
			await server.stop(true);
			native.disable();
		}
	});
	testApi.it(
		'releases admission monitoring without disabling unrelated native monitors',
		async () => {
			const native = monitorEventLoopDelay({ resolution: 1 });
			const admission = new BunEventLoopObserver();
			native.enable();
			admission.enable();
			try {
				await new Promise((resolve) => setTimeout(resolve, 30));
				testApi.expect(admission.percentile(95)).toBeGreaterThan(0);
				admission.disable();
				native.reset();
				await new Promise((resolve) => setTimeout(resolve, 30));
				testApi.expect(native.count).toBeGreaterThan(0);
			} finally {
				admission.disable();
				native.disable();
			}
		}
	);
	testApi.it('observes native pending bodies after the Fetch handler has returned', async () => {
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		const server = bunRuntime().serve({
			port: 0,
			fetch: createBunRequestHandler(
				() =>
					new Response(
						new ReadableStream({
							async start(controller) {
								controller.enqueue(new TextEncoder().encode('head'));
								await pending;
								controller.close();
							}
						})
					)
			)
		});
		try {
			const response = await fetch(server.url);
			const native = server as typeof server & { pendingRequests: number };
			testApi.expect(native.pendingRequests).toBe(1);
			release();
			testApi.expect(await response.text()).toBe('head');
			for (let attempt = 0; native.pendingRequests && attempt < 50; attempt++)
				await new Promise((resolve) => setTimeout(resolve, 2));
			testApi.expect(native.pendingRequests).toBe(0);
		} finally {
			release();
			await server.stop(true);
		}
	});
	testApi.it(
		'flushes the shell through native HTTP before pending production completes',
		async () => {
			let release!: () => void;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const server = bunRuntime().serve({
				port: 0,
				fetch: () =>
					exactResponseToBunResponse(
						createExactAsyncProducedResponse(200, {}, async (write) => {
							await write('shell');
							await gate;
							await write('hydration caf\u00e9 \ud83d\ude80');
						})
					)
			});
			try {
				const response = await fetch(server.url);
				const reader = response.body!.getReader();
				testApi.expect(new TextDecoder().decode((await reader.read()).value)).toBe('shell');
				release();
				let tail = '';
				for (;;) {
					const next = await reader.read();
					if (next.done) break;
					tail += new TextDecoder().decode(next.value);
				}
				testApi.expect(tail).toBe('hydration caf\u00e9 \ud83d\ude80');
			} finally {
				release();
				await server.stop(true);
			}
		}
	);

	testApi.it(
		'keeps unconsumed production lazy and releases its scope on cancellation',
		async () => {
			let starts = 0;
			let releases = 0;
			const exact = createExactAsyncProducedResponse(200, {}, async (write) => {
				starts++;
				await write('unused');
			});
			exactResponseBodyOf(exact)!.retainRequestScope!(async () => {
				releases++;
			});
			const response = exactResponseToBunResponse(exact);
			testApi.expect(starts).toBe(0);
			await response.body!.cancel('cancel before demand');
			testApi.expect(starts).toBe(0);
			testApi.expect(releases).toBe(1);
		}
	);

	testApi.it(
		'propagates producer failures instead of reporting a successful empty body',
		async () => {
			const response = exactResponseToBunResponse(
				createExactAsyncProducedResponse(200, {}, async () => {
					throw new Error('native producer failed');
				})
			);
			await testApi.expect(response.text()).rejects.toThrow('native producer failed');
		}
	);

	testApi.it('aborts an active producer when its reader cancels', async () => {
		let signal!: AbortSignal;
		const response = exactResponseToBunResponse(
			createExactAsyncProducedResponse(200, {}, async (write, ownedSignal) => {
				signal = ownedSignal;
				await write('shell');
				if (!signal.aborted)
					await new Promise<void>((resolve) =>
						signal.addEventListener('abort', () => resolve(), { once: true })
					);
			})
		);
		const reader = response.body!.getReader();
		await reader.read();
		await reader.cancel('client left');
		testApi.expect(signal.aborted).toBe(true);
		testApi.expect(signal.reason).toBe('client left');
	});

	testApi.it('exposes UTF-8 bytes to direct response readers', async () => {
		const response = exactResponseToBunResponse(
			createExactAsyncProducedResponse(200, {}, async (write) => {
				await write('caf\u00e9 \ud83d\ude80');
			})
		);
		const reader = response.body!.getReader();
		try {
			const first = await reader.read();
			testApi.expect(first.value).toBeInstanceOf(Uint8Array);
			testApi.expect(new TextDecoder().decode(first.value)).toBe('caf\u00e9 \ud83d\ude80');
			testApi.expect((await reader.read()).done).toBe(true);
		} finally {
			await reader.cancel();
		}
	});

	testApi.it('pauses production when the response reader stops requesting chunks', async () => {
		let written = 0;
		const response = exactResponseToBunResponse(
			createExactAsyncProducedResponse(200, {}, async (write) => {
				for (let index = 0; index < 100; index++) {
					await write('chunk');
					written++;
				}
			})
		);
		const reader = response.body!.getReader();
		try {
			await reader.read();
			await new Promise<void>((resolve) => setTimeout(resolve, 10));
			testApi.expect(written).toBe(1);
		} finally {
			await reader.cancel('paused client left');
		}
	});

	testApi.it('serves an eXact action through Bun native HTTP', async () => {
		const handler = createExactBunHandler({
			contract: {
				version: 1,
				endpoint: '/__exact',
				invocations: { ping: stateAction('ping') },
				boundaries: {}
			},
			invocations: {
				ping: () => ({ state: { runtime: 'bun' } })
			}
		});
		const bun = bunRuntime();
		const server = bun.serve({ port: 0, fetch: handler });
		try {
			const response = await fetch(new URL('/__exact', server.url), {
				method: 'POST',
				body: JSON.stringify({ type: 'invoke', id: 'ping' })
			});

			testApi.expect(response.status).toBe(200);
			testApi.expect(await response.json()).toEqual({
				ok: true,
				type: 'invoke',
				id: 'ping',
				state: { runtime: 'bun' }
			});
		} finally {
			await server.stop();
		}
	});

	testApi.it('serves compiler-buffered SSR chunks through Bun native HTTP', async () => {
		const bun = bunRuntime();
		const server = bun.serve({
			port: 0,
			fetch: () =>
				exactResponseToBunResponse(
					createExactBufferedResponse(200, { 'content-type': 'text/html' }, [
						'<main>',
						'Ready',
						'</main>'
					])
				)
		});
		try {
			const response = await fetch(server.url);
			testApi.expect(response.headers.get('content-type')).toBe('text/html');
			testApi.expect(await response.text()).toBe('<main>Ready</main>');
		} finally {
			await server.stop();
		}
	});
});

function bunRuntime() {
	return (
		globalThis as unknown as {
			Bun: {
				serve(options: { port: number; fetch(request: Request): Response | Promise<Response> }): {
					url: URL;
					stop(force?: boolean): Promise<void>;
				};
			};
		}
	).Bun;
}

function stateAction(id: string) {
	return defineExactOperationContract(id, {
		writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
	});
}
