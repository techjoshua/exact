import { EventEmitter } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createExactAsyncProducedResponse } from '@exactjs/server';
import { describe, expect, it, vi } from 'vitest';
import { createExactNodeHandler, writeNodeResponse } from './handler.js';

describe('Node response error reporting', () => {
	it('logs real HTTP producer failures without exposing errors or leaving the server unusable', async () => {
		const failure = new Error('private producer detail');
		const logger = { log: vi.fn() };
		const server = createServer((request, response) => {
			if (request.url === '/healthy') {
				response.end('healthy');
				return;
			}
			void writeNodeResponse(
				response,
				createExactAsyncProducedResponse(200, {}, async (write) => {
					if (request.url === '/committed') await write('partial response');
					throw failure;
				}),
				undefined,
				logger
			);
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		try {
			const address = server.address();
			if (!address || typeof address === 'string') throw new Error('Missing HTTP fixture address');
			const url = `http://127.0.0.1:${address.port}`;
			const before = await fetch(`${url}/uncommitted`);
			expect(before.status).toBe(500);
			expect(await before.text()).toBe('{"error":"internal_error"}');
			await expect(fetch(`${url}/committed`).then((result) => result.text())).rejects.toThrow();
			expect(logger.log).toHaveBeenCalledTimes(2);
			for (const [event] of logger.log.mock.calls) expect(event.error).toBe(failure);
			expect(await (await fetch(`${url}/healthy`)).text()).toBe('healthy');
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	});
	it('handles and logs a rejection while writing a resolved handler response', async () => {
		const failure = new Error('header write failed');
		const logger = { log: vi.fn() };
		const handler = createExactNodeHandler({
			publicOrigin: 'http://node.example.test',
			contract: { version: 1, endpoint: '/__exact', invocations: {}, boundaries: {} },
			logger
		});
		const request = Object.assign(new EventEmitter(), {
			method: 'GET',
			url: '/outside',
			headers: { host: 'node.example.test' }
		}) as IncomingMessage;
		let first = true;
		const response = Object.assign(new EventEmitter(), {
			statusCode: 0,
			headersSent: false,
			destroyed: false,
			writableEnded: false,
			setHeader() {
				if (first) {
					first = false;
					throw failure;
				}
				return this;
			},
			getHeaderNames() {
				return [];
			},
			removeHeader() {},
			end: vi.fn()
		}) as unknown as ServerResponse;
		handler(request, response);
		request.emit('end');
		await vi.waitFor(() => expect(response.end).toHaveBeenCalledWith('{"error":"internal_error"}'));
		expect(response.statusCode).toBe(500);
		expect(logger.log).toHaveBeenCalledWith(
			expect.objectContaining({ level: 'error', error: failure })
		);
		expect(request.listenerCount('aborted')).toBe(0);
		expect(response.listenerCount('close')).toBe(0);
	});
	it('reports committed stream failures even when the configured logger fails', async () => {
		const failure = new Error('producer failed');
		const loggingFailure = new Error('logger failed');
		const fallback = vi.spyOn(console, 'error').mockImplementation(() => {});
		const destroy = vi.fn();
		const response = Object.assign(new EventEmitter(), {
			statusCode: 200,
			headersSent: false,
			destroyed: false,
			setHeader() {
				return this;
			},
			write() {
				this.headersSent = true;
				return true;
			},
			end: vi.fn(),
			destroy
		}) as unknown as ServerResponse;
		try {
			await writeNodeResponse(
				response,
				createExactAsyncProducedResponse(200, {}, async (write) => {
					await write('committed');
					throw failure;
				}),
				undefined,
				{
					log() {
						throw loggingFailure;
					}
				}
			);
			expect(destroy).toHaveBeenCalledWith(failure);
			expect(fallback).toHaveBeenCalledWith('eXact Node response failed', failure);
			expect(fallback).toHaveBeenCalledWith(
				'[eXact node-adapter] Error logger failed',
				loggingFailure
			);
		} finally {
			fallback.mockRestore();
		}
	});
});
