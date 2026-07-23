import { describe, expect, it } from 'vitest';
import { createExactFastifyHandler, type ExactFastifyReply } from './index.js';

describe('@exactjs/fastify-adapter', () => {
	it('writes eXact responses through Fastify reply methods', async () => {
		const handler = createExactFastifyHandler({
			manifest: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: { id: 'save', placement: 'server' } }
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
});

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
