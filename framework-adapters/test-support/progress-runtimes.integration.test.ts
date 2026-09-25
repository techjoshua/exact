import { createServer, type Server } from 'node:http';
import express from 'express';
import Fastify from 'fastify';
import Koa from 'koa';
import { server as hapiServer } from '@hapi/hapi';
import { describe, expect, it, vi } from 'vitest';
import { defineExactOperationContract, type ExactServerContext } from '@exactjs/server';
import { createTaskProgressReporter } from '@exactjs/core/runtime/tasks';
import { createExactNodeHandler } from '../node-adapter/src/index.js';
import { createExactExpressMiddleware } from '../express-adapter/src/index.js';
import { createExactFastifyHandler } from '../fastify-adapter/src/index.js';
import { createExactKoaMiddleware } from '../koa-adapter/src/index.js';
import { createExactHapiHandler } from '../hapi-adapter/src/index.js';
import { createExactFetchHandler } from '../fetch-adapter/src/index.js';
import { createExactDenoHandler } from '../deno-adapter/src/index.js';
import { createExactCloudflareHandler } from '../cloudflare-adapter/src/index.js';
import { createExactServerlessHandler } from '../serverless-adapter/src/index.js';

function fixture(buffered = false) {
	let finish!: () => void;
	const completion = new Promise<void>((resolve) => {
		finish = resolve;
	});
	let runs = 0;
	const logger = { log: vi.fn() };
	const operation = {
		...defineExactOperationContract('job'),
		progress: [{ id: 'receiver', label: 'Fixture.report' }]
	};
	const context: ExactServerContext = {
		logger,
		contract: {
			version: 1,
			endpoint: '/__exact',
			invocations: { job: operation },
			boundaries: {},
			executors: {
				job: {
					id: 'job',
					componentId: operation.componentId,
					async execute(_activation, execution) {
						runs++;
						createTaskProgressReporter('receiver', execution.task)(42);
						if (!buffered) await completion;
						return { state: {}, value: 'done' };
					}
				}
			}
		}
	};
	return { context, finish, logger, runs: () => runs };
}
const body = JSON.stringify({
	type: 'invoke',
	id: 'job',
	state: {},
	payload: { dependencies: [] }
});
const headers = {
	'content-type': 'application/json',
	accept: 'application/x-ndjson',
	'x-exact-progress': '1'
};
function request(url: string) {
	return new Request(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(5000) });
}

async function observe(response: Response, finish: () => void) {
	if (response.status !== 200) throw new Error(`${response.status}: ${await response.text()}`);
	const reader = response.body!.getReader();
	let pending = '';
	const events: Array<Record<string, unknown>> = [];
	try {
		while (true) {
			const part = await reader.read();
			if (part.done) break;
			pending += new TextDecoder().decode(part.value);
			let end;
			while ((end = pending.indexOf('\n')) >= 0) {
				const event = JSON.parse(pending.slice(0, end));
				pending = pending.slice(end + 1);
				events.push(event);
				if (event.event === 'progress') {
					expect(event.snapshot).toBe(42);
					finish();
				}
			}
		}
	} finally {
		finish();
		await reader.cancel();
		reader.releaseLock();
	}
	expect(events.map((event) => event.event)).toEqual(['start', 'progress', 'result', 'complete']);
	expect(events.find((event) => event.event === 'result')?.result).toMatchObject({
		ok: true,
		value: 'done'
	});
}

async function listen(server: Server) {
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('No listener');
	return {
		url: `http://127.0.0.1:${address.port}/__exact`,
		close: async () => {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	};
}
async function host(name: string, context: ExactServerContext) {
	if (name === 'fastify') {
		const app = Fastify();
		app.post('/__exact', createExactFastifyHandler(context));
		const url = await app.listen({ host: '127.0.0.1', port: 0 });
		return { url: url + '/__exact', close: () => app.close() };
	}
	if (name === 'hapi') {
		const app = hapiServer({ host: '127.0.0.1', port: 0 });
		app.route({ method: 'POST', path: '/__exact', handler: createExactHapiHandler(context) });
		await app.start();
		return { url: app.info.uri + '/__exact', close: () => app.stop() };
	}
	if (name === 'express') {
		const app = express();
		app.use(express.json());
		app.post('/__exact', createExactExpressMiddleware(context));
		return listen(createServer(app));
	}
	if (name === 'koa') {
		const app = new Koa();
		app.use(async (ctx, next) => {
			// Koa deliberately leaves request parsing to application middleware.
			let body = '';
			for await (const chunk of ctx.req) body += chunk.toString();
			(ctx.request as typeof ctx.request & { body?: unknown }).body = JSON.parse(body);
			await next();
		});
		app.use(createExactKoaMiddleware(context));
		return listen(createServer(app.callback()));
	}
	return listen(createServer(createExactNodeHandler(context)));
}

describe('progress runtime boundaries', () => {
	it.each(['node', 'express', 'fastify', 'koa', 'hapi'])(
		'delivers progress before completion through a real %s listener',
		async (name) => {
			const test = fixture();
			const running = await host(name, test.context);
			try {
				await observe(await fetch(request(running.url)), test.finish);
				expect(test.runs()).toBe(1);
			} finally {
				test.finish();
				await running.close();
			}
		}
	);
	it.each(['fetch', 'deno', 'cloudflare'])(
		'preserves incremental delivery in the %s adapter contract',
		async (name) => {
			const test = fixture();
			try {
				const input = request('http://localhost/__exact');
				const response =
					name === 'fetch'
						? await createExactFetchHandler(test.context)(input)
						: name === 'deno'
							? await createExactDenoHandler(test.context)(input)
							: await createExactCloudflareHandler(test.context)(input, {}, { waitUntil() {} });
				await observe(response, test.finish);
				expect(test.runs()).toBe(1);
			} finally {
				test.finish();
			}
		}
	);
	it('serverless disables progress, warns with attribution, and executes the operation once', async () => {
		const test = fixture(true);
		const response = await createExactServerlessHandler(test.context)({
			httpMethod: 'POST',
			path: '/__exact',
			headers,
			body
		});
		const events = response.body
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		expect(events.some((event) => event.event === 'progress')).toBe(false);
		expect(events.find((event) => event.event === 'result').result).toMatchObject({
			ok: true,
			value: 'done'
		});
		expect(test.runs()).toBe(1);
		expect(
			test.logger.log.mock.calls.some(
				([event]) =>
					event.level === 'warn' &&
					String(event.message).includes('Fixture.report') &&
					String(event.message).includes('serverless')
			)
		).toBe(true);
	});
});
