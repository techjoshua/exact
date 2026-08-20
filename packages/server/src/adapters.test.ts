import { describe, expect, it } from 'vitest';
import {
	createExpressHandler,
	createFetchHandler,
	createHapiHandler,
	type ExactExpressResponse,
	type ExactHapiResponse,
	type ExactHapiToolkit
} from './index.js';
import { context } from './test-support/server.js';

describe('@exactjs/server adapters', () => {
	it('dispatches through fetch-compatible adapters', async () => {
		const handler = createFetchHandler(context());
		const response = await handler(
			new Request('https://app.test/__exact', {
				method: 'POST',
				body: JSON.stringify({ type: 'invoke', id: 'allowed-action', payload: { title: 'Fetch' } }),
				headers: { 'content-type': 'application/json' }
			})
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			ok: true,
			patches: [{ type: 'text', id: 'title', value: 'Fetch' }]
		});
	});

	it('stops reading Fetch request bodies at the configured byte limit', async () => {
		let cancelled = false;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.enqueue(new Uint8Array(9));
			},
			cancel() {
				cancelled = true;
			}
		});
		const response = await createFetchHandler(context({ limits: { maxRequestBytes: 16 } }))(
			new Request('https://app.test/__exact', {
				method: 'POST',
				body,
				duplex: 'half'
			} as RequestInit)
		);

		expect(response.status).toBe(400);
		expect(cancelled).toBe(true);
	});

	it('dispatches through express-style adapters', async () => {
		const sent = new Promise<{ status: number; headers: Record<string, string>; body: string }>(
			(resolve) => {
				const headers: Record<string, string> = {};
				type TestExpressResponse = ExactExpressResponse & { statusCode: number };
				const expressResponse: TestExpressResponse = {
					statusCode: 200,
					status(value: number) {
						this.statusCode = value;
						return this;
					},
					setHeader(name: string, value: string) {
						headers[name] = value;
					},
					send(body: unknown) {
						resolve({ status: this.statusCode, headers, body: String(body) });
					}
				};

				createExpressHandler(context())(
					{
						method: 'POST',
						url: '/__exact',
						body: { type: 'invoke', id: 'allowed-action', payload: { title: 'Express' } },
						headers: {}
					},
					expressResponse
				);
			}
		);

		const response = await sent;
		expect(response.status).toBe(200);
		expect(JSON.parse(response.body)).toMatchObject({
			ok: true,
			patches: [{ type: 'text', id: 'title', value: 'Express' }]
		});
	});

	it('turns express disconnect events into request cancellation', async () => {
		const upstream = new AbortController();
		let disconnect!: () => void;
		let started!: () => void;
		const didStart = new Promise<void>((resolve) => {
			started = resolve;
		});
		let observedAbort = false;
		const finished = new Promise<void>((resolve) => {
			createExpressHandler(
				context({
					invocations: {
						'allowed-action': (_input, requestContext) =>
							new Promise((actionResolve) => {
								started();
								requestContext.signal?.addEventListener(
									'abort',
									() => {
										observedAbort = true;
										actionResolve({});
									},
									{ once: true }
								);
							})
					}
				})
			)(
				{
					method: 'POST',
					url: '/__exact',
					headers: { accept: 'application/x-ndjson' },
					body: { type: 'invoke', id: 'allowed-action' },
					signal: upstream.signal,
					once(event, listener) {
						if (event === 'aborted') disconnect = listener;
					},
					off() {}
				},
				{
					status() {
						return this;
					},
					setHeader() {},
					write() {},
					end() {
						resolve();
					},
					send() {
						resolve();
					},
					destroy() {
						resolve();
					},
					once() {},
					off() {}
				}
			);
		});

		await didStart;
		disconnect();
		await finished;
		expect(observedAbort).toBe(true);
	});

	it('dispatches through hapi-style adapters', async () => {
		type TestHapiResponse = ExactHapiResponse & {
			body: string;
			statusCode: number;
		};
		const toolkit: ExactHapiToolkit<TestHapiResponse> = {
			response(body: unknown) {
				return {
					code(status: number): TestHapiResponse {
						return {
							body: String(body),
							statusCode: status,
							header() {
								return this;
							}
						};
					}
				};
			}
		};
		const handler = createHapiHandler<TestHapiResponse>(context());
		const response = await handler(
			{
				method: 'POST',
				url: { path: '/__exact' },
				headers: {},
				payload: { type: 'invoke', id: 'allowed-action', payload: { title: 'Hapi' } }
			},
			toolkit
		);

		expect(response.statusCode).toBe(200);
		expect(JSON.parse(response.body)).toMatchObject({
			ok: true,
			patches: [{ type: 'text', id: 'title', value: 'Hapi' }]
		});
	});
});
