import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineExactActionContract } from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import { createExactNodeHandler, readNodeRequestBody, writeNodeResponse } from './index.js';

function stateAction(id: string) {
	return defineExactActionContract(id, {
		writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
	});
}

describe('@exactjs/node-adapter', () => {
	it('handles eXact requests through Node request and response objects', async () => {
		const handler = createExactNodeHandler({
			contract: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: stateAction('save') },
				boundaries: {}
			},
			actions: {
				save: (_input, context) => ({
					state: {
						method: context.requestContext?.method,
						url: context.requestContext?.url.href,
						platformUrl: (context.platformRequest as IncomingMessage).url
					}
				})
			}
		});

		const request = new EventEmitter() as IncomingMessage;
		request.method = 'POST';
		request.url = '/__exact';
		request.headers = { host: 'node.example.test' };

		let resolveDone!: () => void;
		const done = new Promise<void>((resolve) => {
			resolveDone = resolve;
		});
		type TestNodeResponse = ServerResponse & {
			body: string;
			headers: Record<string, number | string | string[]>;
		};

		const response = Object.assign(new EventEmitter(), {
			statusCode: 0,
			body: '',
			headers: {} as Record<string, number | string | string[]>,
			setHeader(this: TestNodeResponse, name: string, value: number | string | readonly string[]) {
				this.headers[name] = typeof value === 'object' ? [...value] : value;
				return this;
			},
			write(this: TestNodeResponse, chunk: Uint8Array | string) {
				this.body += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
				return true;
			},
			end(this: TestNodeResponse, chunk?: Uint8Array | string) {
				if (chunk) this.write(chunk);
				resolveDone();
				return this;
			},
			destroy(error?: Error) {
				throw error ?? new Error('destroyed');
			}
		}) as unknown as TestNodeResponse;

		handler(request, response);
		request.emit('data', JSON.stringify({ type: 'action', id: 'save' }));
		request.emit('end');

		await done;
		expect(response.statusCode).toBe(200);
		expect(JSON.parse(response.body)).toEqual({
			ok: true,
			type: 'action',
			id: 'save',
			state: {
				method: 'POST',
				url: 'http://node.example.test/__exact',
				platformUrl: '/__exact'
			}
		});
	});

	it('waits for writable backpressure before reading the next stream chunk', async () => {
		const events = new EventEmitter();
		const writes: string[] = [];
		let reads = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				reads++;
				controller.enqueue(Buffer.from(String(reads)));
				if (reads === 2) controller.close();
			}
		});
		const response = Object.assign(events, {
			statusCode: 0,
			destroyed: false,
			setHeader() {
				return this;
			},
			write(chunk: Uint8Array) {
				writes.push(Buffer.from(chunk).toString('utf8'));
				if (writes.length === 1) {
					setTimeout(() => events.emit('drain'), 5);
					return false;
				}
				return true;
			},
			end() {
				events.emit('ended');
				return this;
			},
			destroy() {
				this.destroyed = true;
				return this;
			}
		}) as unknown as ServerResponse;

		await writeNodeResponse(response, { status: 200, headers: {}, body: '', stream });
		expect(writes).toEqual(['1', '2']);
		expect(reads).toBe(2);
	});

	it('collects mixed request chunks and propagates transport errors', async () => {
		const request = new EventEmitter() as IncomingMessage;
		const body = readNodeRequestBody(request);
		request.emit('data', Buffer.from('first'));
		request.emit('data', '-second');
		request.emit('end');
		await expect(body).resolves.toBe('first-second');

		const failedRequest = new EventEmitter() as IncomingMessage;
		const failedBody = readNodeRequestBody(failedRequest);
		failedRequest.emit('error', new Error('socket failed'));
		await expect(failedBody).rejects.toThrow('socket failed');
	});

	it('writes status, headers, and non-stream bodies', async () => {
		const response = Object.assign(new EventEmitter(), {
			statusCode: 0,
			headers: new Map<string, unknown>(),
			body: '',
			setHeader(name: string, value: unknown) {
				this.headers.set(name, value);
				return this;
			},
			end(chunk?: string) {
				this.body += chunk ?? '';
				return this;
			}
		}) as unknown as ServerResponse & { headers: Map<string, unknown>; body: string };

		await writeNodeResponse(response, {
			status: 202,
			headers: { 'x-result': 'accepted' },
			body: 'queued'
		});

		expect(response.statusCode).toBe(202);
		expect(response.headers.get('x-result')).toBe('accepted');
		expect(response.body).toBe('queued');
	});

	it('cancels a backpressured stream when the client disconnects', async () => {
		const disconnect = new AbortController();
		let cancelled: unknown;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.enqueue(Buffer.from('chunk'));
			},
			cancel(reason) {
				cancelled = reason;
			}
		});
		const events = new EventEmitter();
		const response = Object.assign(events, {
			statusCode: 0,
			destroyed: false,
			destroyError: undefined as Error | undefined,
			setHeader() {
				return this;
			},
			write() {
				disconnect.abort(new DOMException('Client disconnected', 'AbortError'));
				return false;
			},
			end() {
				return this;
			},
			destroy(error?: Error) {
				this.destroyed = true;
				this.destroyError = error;
				return this;
			}
		}) as unknown as ServerResponse & { destroyError?: Error };

		await writeNodeResponse(
			response,
			{ status: 200, headers: {}, body: '', stream },
			disconnect.signal
		);

		expect(cancelled).toBeInstanceOf(DOMException);
		expect(response.destroyError?.name).toBe('AbortError');
	});
});
