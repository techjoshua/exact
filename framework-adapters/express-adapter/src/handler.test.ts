import { defineExactOperationContract, type ExactServerContext } from '@exactjs/server';
import { describe, expect, it, vi } from 'vitest';
import { createExactExpressMiddleware, type ExactExpressResponse } from './index.js';

describe('@exactjs/express-adapter', () => {
	it('writes eXact responses through Express response methods', async () => {
		const middleware = createExactExpressMiddleware({
			publicOrigin: 'http://express.example.test',
			contract: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: stateAction('save') },
				boundaries: {}
			},
			actions: {
				save: (_input, context) => ({
					state: {
						runtime: 'express',
						url: context.requestContext?.url.href,
						platformUrl: (context.platformRequest as { originalUrl?: string }).originalUrl
					}
				})
			}
		});
		const response = createExpressResponse();

		middleware(
			{
				method: 'POST',
				originalUrl: '/__exact',
				headers: { host: 'express.example.test' },
				body: { type: 'action', id: 'save' }
			},
			response
		);

		await response.done;
		expect(response.statusCode).toBe(200);
		expect(JSON.parse(String(response.body))).toEqual({
			ok: true,
			type: 'action',
			id: 'save',
			state: {
				runtime: 'express',
				url: 'http://express.example.test/__exact',
				platformUrl: '/__exact'
			}
		});
	});

	it('streams response chunks and serializes action failures', async () => {
		const context: ExactServerContext = {
			contract: {
				version: 1 as const,
				endpoint: '/__exact',
				actions: {
					save: stateAction('save'),
					fail: defineExactOperationContract('fail')
				},
				boundaries: {}
			},
			actions: {
				save: () => ({ state: { saved: true } }),
				fail: () => {
					throw new Error('action failed');
				}
			}
		};
		const middleware = createExactExpressMiddleware(context);
		const streamed = createStreamingExpressResponse();

		middleware(
			{
				method: 'POST',
				url: '/__exact',
				headers: {
					host: 'express.example.test',
					accept: 'application/x-ndjson'
				},
				async text() {
					return JSON.stringify({ type: 'action', id: 'save' });
				}
			},
			streamed
		);

		await streamed.done;
		expect(streamed.statusCode).toBe(200);
		expect(streamed.chunks.join('')).toContain('"event":"complete"');

		const failed = createExpressResponse();
		middleware(
			{
				method: 'POST',
				url: '/__exact',
				headers: { host: 'express.example.test' },
				body: { type: 'action', id: 'fail' }
			},
			failed
		);
		await failed.done;
		expect(failed.statusCode).toBe(500);
		expect(JSON.parse(String(failed.body))).toEqual({ error: 'internal_error' });
	});

	it('forwards request-scope initialization failures to next', async () => {
		const middleware = createExactExpressMiddleware({
			contract: {
				version: 1,
				endpoint: '/__exact',
				actions: {},
				boundaries: {}
			},
			requestContexts() {
				throw new Error('context failed');
			}
		});
		const next = vi.fn();

		middleware(
			{
				method: 'POST',
				url: '/__exact',
				headers: { host: 'express.example.test' },
				body: { type: 'action', id: 'missing' }
			},
			createExpressResponse(),
			next
		);

		await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
		expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'context failed' }));
	});
});

function stateAction(id: string) {
	return defineExactOperationContract(id, {
		writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
	});
}

function createExpressResponse(): ExactExpressResponse & {
	statusCode?: number;
	body?: unknown;
	done: Promise<void>;
} {
	let finish!: () => void;
	return {
		done: new Promise((resolve) => {
			finish = resolve;
		}),
		status(code) {
			this.statusCode = code;
			return this;
		},
		setHeader() {},
		send(body) {
			this.body = body;
			finish();
		}
	};
}

function createStreamingExpressResponse(): ExactExpressResponse & {
	statusCode?: number;
	chunks: string[];
	done: Promise<void>;
} {
	let finish!: () => void;
	const chunks: string[] = [];
	return {
		chunks,
		done: new Promise((resolve) => {
			finish = resolve;
		}),
		status(code) {
			this.statusCode = code;
			return this;
		},
		setHeader() {},
		write(chunk) {
			chunks.push(Buffer.from(chunk).toString('utf8'));
		},
		end() {
			finish();
		},
		send() {
			throw new Error('stream should not use send');
		},
		destroy(error) {
			throw error;
		}
	};
}
