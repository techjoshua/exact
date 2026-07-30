import { EventEmitter } from 'node:events';
import { defineExactOperationContract } from '@exactjs/server';
import { describe, expect, it, vi } from 'vitest';
import { createExactFastifyHandler, type ExactFastifyReply } from './index.js';

describe('@exactjs/fastify-adapter', () => {
	it('writes eXact responses through Fastify reply methods', async () => {
		const handler = createExactFastifyHandler({
			publicOrigin: 'http://fastify.example.test',
			contract: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: stateAction('save') },
				boundaries: {}
			},
			actions: {
				save: (_input, context) => ({
					state: {
						runtime: 'fastify',
						url: context.requestContext?.url.href,
						platformUrl: (context.platformRequest as { url: string }).url
					}
				})
			}
		});
		const reply = createFastifyReply();

		await handler(
			{
				method: 'POST',
				url: '/__exact',
				headers: { host: 'fastify.example.test' },
				body: { type: 'action', id: 'save' }
			},
			reply
		);

		expect(reply.statusCode).toBe(200);
		expect(JSON.parse(String(reply.body))).toEqual({
			ok: true,
			type: 'action',
			id: 'save',
			state: {
				runtime: 'fastify',
				url: 'http://fastify.example.test/__exact',
				platformUrl: '/__exact'
			}
		});
	});

	it('aborts request work when the Fastify response closes', async () => {
		const response = new EventEmitter();
		let actionSignal!: AbortSignal;
		const handler = createExactFastifyHandler({
			contract: {
				version: 1,
				endpoint: '/__exact',
				actions: { wait: stateAction('wait') },
				boundaries: {}
			},
			actions: {
				wait: async (_input, context) => {
					actionSignal = context.signal!;
					await new Promise<void>((resolve) =>
						actionSignal.addEventListener('abort', () => resolve(), { once: true })
					);
					return { state: 'cancelled' };
				}
			}
		});
		const reply = createFastifyReply();
		reply.raw = response;
		const pending = handler(
			{
				method: 'POST',
				url: '/__exact',
				headers: { host: 'fastify.example.test' },
				body: { type: 'action', id: 'wait' }
			},
			reply
		);

		await vi.waitFor(() => expect(actionSignal).toBeDefined());
		response.emit('close');
		await pending;

		expect(actionSignal.aborted).toBe(true);
		expect(response.listenerCount('close')).toBe(0);
	});
});

function stateAction(id: string) {
	return defineExactOperationContract(id, {
		writes: [{ path: '*', kind: 'write', confidence: 'exact' }]
	});
}

function createFastifyReply(): ExactFastifyReply & { statusCode?: number; body?: unknown } {
	return {
		code(status) {
			this.statusCode = status;
			return this;
		},
		header() {
			return this;
		},
		send(body) {
			this.body = body;
			return body;
		}
	};
}
