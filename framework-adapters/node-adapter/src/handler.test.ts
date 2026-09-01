import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
	createExactAsyncProducedResponse,
	createExactBufferedResponse,
	createExactProducedResponse,
	defineExactOperationContract,
	exactResponseBodyOf
} from '@exactjs/server';
import { describe, expect, it, vi } from 'vitest';
import { createExactNodeHandler, readNodeRequestBody, writeNodeResponse } from './index.js';

function stateAction(id: string) {
	return defineExactOperationContract(id, {
		writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
	});
}

describe('@exactjs/node-adapter', () => {
	it('handles eXact requests through Node request and response objects', async () => {
		const handler = createExactNodeHandler({
			publicOrigin: 'http://node.example.test',
			contract: {
				version: 1,
				endpoint: '/__exact',
				invocations: { save: stateAction('save') },
				boundaries: {}
			},
			invocations: {
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
		request.emit('data', JSON.stringify({ type: 'invoke', id: 'save' }));
		request.emit('end');

		await done;
		expect(response.statusCode).toBe(200);
		expect(JSON.parse(response.body)).toEqual({
			ok: true,
			type: 'invoke',
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

	it('rejects an oversized body while it is being received and removes listeners', async () => {
		const request = Object.assign(new EventEmitter(), {
			resume: vi.fn()
		}) as unknown as IncomingMessage & { resume: ReturnType<typeof vi.fn> };
		const body = readNodeRequestBody(request, 5);

		request.emit('data', Buffer.from('123'));
		request.emit('data', Buffer.from('456'));

		await expect(body).rejects.toThrow('exceeded 5 bytes');
		expect(request.resume).toHaveBeenCalledTimes(1);
		expect(request.listenerCount('data')).toBe(0);
		expect(request.listenerCount('end')).toBe(0);
		expect(request.listenerCount('error')).toBe(0);
	});

	it('rejects an oversized declared body before installing transport listeners', async () => {
		const request = Object.assign(new EventEmitter(), {
			headers: { 'content-length': '12' },
			resume: vi.fn()
		}) as unknown as IncomingMessage & { resume: ReturnType<typeof vi.fn> };

		await expect(readNodeRequestBody(request, 5)).rejects.toThrow('exceeded 5 bytes');
		expect(request.resume).toHaveBeenCalledTimes(1);
		expect(request.listenerCount('data')).toBe(0);
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

	it('writes buffered SSR bodies without materializing their Web stream', async () => {
		const response = Object.assign(new EventEmitter(), {
			statusCode: 0,
			destroyed: false,
			body: '',
			setHeader() {
				return this;
			},
			write(chunk: string | Uint8Array) {
				this.body += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
				return true;
			},
			end() {
				return this;
			},
			destroy() {
				this.destroyed = true;
				return this;
			}
		}) as unknown as ServerResponse & { body: string };
		const result = createExactBufferedResponse(200, {}, '<main>ready</main>');

		await writeNodeResponse(response, result);

		expect(response.body).toBe('<main>ready</main>');
		expect(() => result.stream).toThrow('already claimed');
	});

	it('hands a produced SSR rope to one terminal Node write', async () => {
		const writes: string[] = [];
		const response = Object.assign(new EventEmitter(), {
			statusCode: 0,
			destroyed: false,
			headersSent: false,
			body: '',
			setHeader() {
				return this;
			},
			write(chunk: string) {
				writes.push(chunk);
				return true;
			},
			end(chunk?: string) {
				if (chunk) this.body += chunk;
				return this;
			},
			destroy() {
				this.destroyed = true;
				return this;
			}
		}) as unknown as ServerResponse & { body: string };
		const result = createExactProducedResponse(200, {}, (write) => {
			write('<main>');
			write('ready');
			write('</main>');
		});

		const completion = writeNodeResponse(response, result);
		expect(writes).toEqual([]);
		expect(response.body).toBe('<main>ready</main>');
		await completion;
	});

	it('writes asynchronous produced spans directly with Node backpressure', async () => {
		const events = new EventEmitter();
		const writes: string[] = [];
		const production: string[] = [];
		const response = Object.assign(events, {
			statusCode: 0,
			destroyed: false,
			setHeader() {
				return this;
			},
			write(chunk: string) {
				writes.push(chunk);
				return writes.length !== 1;
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
		const result = createExactAsyncProducedResponse(200, {}, async (write) => {
			production.push('first');
			await write('first');
			production.push('second');
			await write('second');
		});

		const completion = writeNodeResponse(response, result);
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(writes).toEqual(['first']);
		expect(production).toEqual(['first']);

		events.emit('drain');
		await completion;
		expect(writes).toEqual(['first', 'second']);
		expect(production).toEqual(['first', 'second']);
	});

	it('publishes an internal error when a produced body fails before commitment', async () => {
		const response = Object.assign(new EventEmitter(), {
			statusCode: 0,
			destroyed: false,
			headersSent: false,
			headers: new Map<string, unknown>(),
			body: '',
			setHeader(name: string, value: unknown) {
				this.headers.set(name, value);
				return this;
			},
			getHeaderNames() {
				return [...this.headers.keys()];
			},
			removeHeader(name: string) {
				this.headers.delete(name);
			},
			end(chunk?: string) {
				if (chunk) this.body += chunk;
				return this;
			},
			destroy() {
				this.destroyed = true;
				return this;
			}
		}) as unknown as ServerResponse & {
			body: string;
			headers: Map<string, unknown>;
		};
		const result = createExactProducedResponse(
			200,
			{ 'content-length': '123', 'x-produced': 'stale' },
			() => {
				throw new Error('render failed');
			}
		);

		await writeNodeResponse(response, result);

		expect(response.statusCode).toBe(500);
		expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
		expect(response.headers.has('content-length')).toBe(false);
		expect(response.headers.has('x-produced')).toBe(false);
		expect(response.body).toBe('{"error":"internal_error"}');
		expect(response.destroyed).toBe(false);
	});

	it('publishes an internal error when an asynchronous producer fails before commitment', async () => {
		const response = Object.assign(new EventEmitter(), {
			statusCode: 0,
			destroyed: false,
			headersSent: false,
			headers: new Map<string, unknown>(),
			body: '',
			setHeader(name: string, value: unknown) {
				this.headers.set(name, value);
				return this;
			},
			getHeaderNames() {
				return [...this.headers.keys()];
			},
			removeHeader(name: string) {
				this.headers.delete(name);
			},
			write() {
				this.headersSent = true;
				return true;
			},
			end(chunk?: string) {
				if (chunk) this.body += chunk;
				return this;
			},
			destroy() {
				this.destroyed = true;
				return this;
			}
		}) as unknown as ServerResponse & {
			body: string;
			headers: Map<string, unknown>;
		};
		const result = createExactAsyncProducedResponse(
			200,
			{ 'content-length': '123', 'x-produced': 'stale' },
			async () => {
				throw new Error('render failed');
			}
		);

		await writeNodeResponse(response, result);

		expect(response.statusCode).toBe(500);
		expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
		expect(response.headers.has('content-length')).toBe(false);
		expect(response.headers.has('x-produced')).toBe(false);
		expect(response.body).toBe('{"error":"internal_error"}');
		expect(response.destroyed).toBe(false);
	});

	it('publishes a request-scope cleanup failure before commitment', async () => {
		const response = Object.assign(new EventEmitter(), {
			statusCode: 0,
			destroyed: false,
			headersSent: false,
			headers: new Map<string, unknown>(),
			body: '',
			setHeader(name: string, value: unknown) {
				this.headers.set(name, value);
				return this;
			},
			getHeaderNames() {
				return [...this.headers.keys()];
			},
			removeHeader(name: string) {
				this.headers.delete(name);
			},
			end(chunk?: string) {
				if (chunk) this.body += chunk;
				return this;
			},
			destroy() {
				this.destroyed = true;
				return this;
			}
		}) as unknown as ServerResponse & {
			body: string;
			headers: Map<string, unknown>;
		};
		const result = createExactProducedResponse(200, {}, (write) => write('uncommitted'));
		exactResponseBodyOf(result)!.retainRequestScope?.(async () => {
			throw new Error('cleanup failed');
		});

		await writeNodeResponse(response, result);

		expect(response.statusCode).toBe(500);
		expect(response.body).toBe('{"error":"internal_error"}');
		expect(response.destroyed).toBe(false);
	});

	it('resumes ordered buffered chunks only after Node backpressure clears', async () => {
		const events = new EventEmitter();
		let writes = 0;
		const response = Object.assign(events, {
			statusCode: 0,
			destroyed: false,
			body: '',
			setHeader() {
				return this;
			},
			write(chunk: string) {
				this.body += chunk;
				writes++;
				if (writes === 1) {
					queueMicrotask(() => events.emit('drain'));
					return false;
				}
				return true;
			},
			end() {
				return this;
			},
			destroy() {
				this.destroyed = true;
				return this;
			}
		}) as unknown as ServerResponse & { body: string };

		await writeNodeResponse(
			response,
			createExactBufferedResponse(200, {}, ['first', 'second', 'third'])
		);

		expect(response.body).toBe('firstsecondthird');
		expect(writes).toBe(3);
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
