import { describe, expect, it } from 'vitest';
import { createExactServerlessHandler, responseToServerlessResult } from './index.js';

describe('@exact/serverless-adapter', () => {
	it('handles API Gateway style events', async () => {
		const handler = createExactServerlessHandler({
			manifest: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: { id: 'save', placement: 'server' } }
			},
			actions: {
				save: (_input, context) => ({
					state: {
						runtime: 'serverless',
						url: context.requestContext?.url.href,
						platformMethod: (context.platformRequest as { httpMethod?: string }).httpMethod
					}
				})
			}
		});

		const response = await handler({
			httpMethod: 'POST',
			rawPath: '/__exact',
			headers: { host: 'lambda.example.test', 'x-forwarded-proto': 'https' },
			body: JSON.stringify({ type: 'action', id: 'save' })
		});

		expect(response.statusCode).toBe(200);
		expect(JSON.parse(response.body)).toEqual({
			ok: true,
			type: 'action',
			id: 'save',
			state: {
				runtime: 'serverless',
				url: 'https://lambda.example.test/__exact',
				platformMethod: 'POST'
			}
		});
	});

	it('normalizes alternate event fields, query strings, and base64 request bodies', async () => {
		const handler = createExactServerlessHandler({
			manifest: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: { id: 'save', placement: 'server' } }
			},
			actions: {
				save: (input, context) => ({
					state: {
						payload: input.payload,
						method: context.requestContext?.method,
						url: context.requestContext?.url.href
					}
				})
			}
		});
		const body = Buffer.from(
			JSON.stringify({ type: 'action', id: 'save', payload: 'decoded' })
		).toString('base64');

		const response = await handler({
			method: 'POST',
			path: '/__exact',
			rawQueryString: 'source=lambda',
			headers: { host: 'lambda.example.test' },
			body,
			isBase64Encoded: true
		});

		expect(JSON.parse(response.body)).toEqual(
			expect.objectContaining({
				state: {
					payload: 'decoded',
					method: 'POST',
					url: 'http://lambda.example.test/__exact?source=lambda'
				}
			})
		);
	});

	it('converts streamed and empty responses into the serverless contract', async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('first'));
				controller.enqueue(new TextEncoder().encode('-second'));
				controller.close();
			}
		});

		await expect(
			responseToServerlessResult({
				status: 201,
				headers: { 'x-test': 'stream' },
				body: '',
				stream
			})
		).resolves.toEqual({
			statusCode: 201,
			headers: { 'x-test': 'stream' },
			body: 'first-second',
			isBase64Encoded: false
		});
		await expect(
			responseToServerlessResult({ status: 204, headers: {}, body: '' })
		).resolves.toEqual({
			statusCode: 204,
			headers: {},
			body: '',
			isBase64Encoded: false
		});
	});
});
