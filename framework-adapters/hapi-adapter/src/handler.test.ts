import { server as createHapiServer, type Server } from '@hapi/hapi';
import { defineExactOperationContract, type ExactServerContext } from '@exactjs/server';
import { request as createHttpRequest } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExactHapiHandler, exactHapiPlugin, type ExactHapiPluginOptions } from './index.js';

const servers: Server[] = [];

afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.stop()));
});

describe('@exactjs/hapi-adapter', () => {
	it('registers the contract endpoint and handles a real Hapi request', async () => {
		const server = trackedServer();
		await registerExact(server, runtime());

		const response = await server.inject({
			method: 'POST',
			url: '/__exact?source=hapi',
			payload: { type: 'action', id: 'save' }
		});

		expect(response.statusCode).toBe(200);
		expect(response.headers['content-type']).toContain('application/json');
		const result = JSON.parse(response.payload) as {
			ok: boolean;
			type: string;
			id: string;
			state: { runtime: string; url: string; platformPath: string };
		};
		expect(result).toMatchObject({
			ok: true,
			type: 'action',
			id: 'save',
			state: {
				runtime: 'hapi',
				platformPath: '/__exact'
			}
		});
		const requestUrl = new URL(result.state.url);
		expect(requestUrl.pathname).toBe('/__exact');
		expect(requestUrl.search).toBe('?source=hapi');
	});

	it('uses /__exact when the contract omits its endpoint', async () => {
		const server = trackedServer();
		const context = runtime();
		delete context.contract.endpoint;
		await registerExact(server, context);

		const response = await server.inject({
			method: 'POST',
			url: '/__exact',
			payload: { type: 'action', id: 'save' }
		});

		expect(response.statusCode).toBe(200);
	});

	it('applies route options and aligns Hapi payload limits with the runtime', async () => {
		const server = trackedServer();
		const context = runtime();
		context.limits = { maxRequestBytes: 96 };
		await registerExact(server, context, {
			routeOptions: { tags: ['api', 'exact'] }
		});

		const route = server.match('post', '/__exact');
		expect(route?.settings.tags).toEqual(['api', 'exact']);
		expect(route?.settings.payload?.maxBytes).toBe(96);

		const response = await server.inject({
			method: 'POST',
			url: '/__exact',
			payload: { type: 'action', id: 'save', state: { oversized: 'x'.repeat(128) } }
		});
		expect(response.statusCode).toBe(413);
	});

	it('converts eXact Web streams into Hapi response streams', async () => {
		const server = trackedServer();
		await registerExact(server, runtime());

		const response = await server.inject({
			method: 'POST',
			url: '/__exact',
			headers: { accept: 'application/x-ndjson' },
			payload: { type: 'action', id: 'save' }
		});

		expect(response.statusCode).toBe(200);
		expect(response.headers['content-type']).toContain('application/x-ndjson');
		const events = response.payload
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line) as { event: string });
		expect(events.map((event) => event.event)).toEqual(['start', 'state', 'result', 'complete']);
	});

	it('retains the direct handler API for manually configured routes', async () => {
		const server = trackedServer();
		server.route({
			method: 'POST',
			path: '/__exact',
			handler: createExactHapiHandler(runtime())
		});

		const response = await server.inject({
			method: 'POST',
			url: '/__exact',
			payload: { type: 'action', id: 'save' }
		});

		expect(response.statusCode).toBe(200);
	});

	it('rejects a contract endpoint that Hapi cannot register safely', async () => {
		const server = trackedServer();
		const context = runtime();
		context.contract.endpoint = 'relative';

		await expect(registerExact(server, context)).rejects.toThrow(
			'eXact Hapi endpoint must be an absolute path'
		);
	});

	it('aborts eXact work when the Hapi client disconnects', async () => {
		const server = trackedServer({ port: 0, host: '127.0.0.1' });
		let started!: () => void;
		const actionStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		let observedAbort!: (reason: unknown) => void;
		const actionAborted = new Promise<unknown>((resolve) => {
			observedAbort = resolve;
		});
		const context = runtime();
		context.contract.actions.wait = stateAction('wait');
		context.actions!.wait = async (_input, requestContext) => {
			const signal = requestContext.signal!;
			started();
			await new Promise<void>((resolve) => {
				if (signal.aborted) {
					observedAbort(signal.reason);
					resolve();
					return;
				}
				signal.addEventListener(
					'abort',
					() => {
						observedAbort(signal.reason);
						resolve();
					},
					{ once: true }
				);
			});
			return { state: 'cancelled' };
		};
		await registerExact(server, context);
		await server.start();

		const body = JSON.stringify({ type: 'action', id: 'wait' });
		const request = createHttpRequest(`${server.info.uri}/__exact`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'content-length': Buffer.byteLength(body)
			}
		});
		request.on('error', () => undefined);
		request.end(body);
		await actionStarted;
		request.destroy();

		const reason = await Promise.race([
			actionAborted,
			new Promise<never>((_resolve, reject) => {
				setTimeout(() => reject(new Error('Hapi disconnect did not abort eXact work')), 2_000);
			})
		]);
		expect(reason).toBeInstanceOf(DOMException);
		expect((reason as DOMException).name).toBe('AbortError');
	});

	it('exposes the Hapi plugin under its package identity', () => {
		expect(exactHapiPlugin).toMatchObject({
			name: '@exactjs/hapi-adapter',
			version: '0.1.0',
			multiple: true
		});
		expect(vi.isMockFunction(exactHapiPlugin.register)).toBe(false);
	});
});

function trackedServer(options?: Parameters<typeof createHapiServer>[0]): Server {
	const server = createHapiServer(options);
	servers.push(server);
	return server;
}

async function registerExact(
	server: Server,
	context: ExactServerContext,
	options: Omit<ExactHapiPluginOptions, 'runtime'> = {}
): Promise<void> {
	await server.register({
		plugin: exactHapiPlugin,
		options: { runtime: context, ...options }
	});
}

function runtime(): ExactServerContext {
	return {
		contract: {
			version: 1,
			endpoint: '/__exact',
			actions: { save: stateAction('save') },
			boundaries: {}
		},
		actions: {
			save: (_input, context) => ({
				state: {
					runtime: 'hapi',
					url: context.requestContext?.url.href,
					platformPath: (context.platformRequest as { path?: string }).path
				}
			})
		}
	};
}

function stateAction(id: string) {
	return defineExactOperationContract(id, {
		writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
	});
}
