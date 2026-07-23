import { describe, expect, it } from 'vitest';
import { createExactHapiHandler } from './index.js';

type TestHapiResponse = {
	body: unknown;
	statusCode: number;
	headers: Record<string, string>;
	code(status: number): TestHapiResponse;
	header(name: string, value: string): TestHapiResponse;
};

describe('@exactjs/hapi-adapter', () => {
	it('returns a Hapi response object', async () => {
		const handler = createExactHapiHandler({
			manifest: {
				version: 1,
				endpoint: '/__exact',
				actions: { save: { id: 'save', placement: 'server' } }
			},
			actions: {
				save: (_input, context) => ({
					state: {
						runtime: 'hapi',
						url: context.requestContext?.url.href,
						platformPath: (context.platformRequest as { url?: { path?: string } }).url?.path
					}
				})
			}
		});

		const response = (await handler(
			{
				method: 'POST',
				url: { path: '/__exact' },
				headers: { host: 'hapi.example.test' },
				payload: { type: 'action', id: 'save' }
			},
			createHapiToolkit()
		)) as TestHapiResponse;

		expect(response.statusCode).toBe(200);
		expect(JSON.parse(String(response.body))).toEqual({
			ok: true,
			type: 'action',
			id: 'save',
			state: {
				runtime: 'hapi',
				url: 'http://hapi.example.test/__exact',
				platformPath: '/__exact'
			}
		});
	});
});

function createHapiToolkit(): { response(body: unknown): TestHapiResponse } {
	return {
		response(body: unknown) {
			return {
				body,
				statusCode: 200,
				headers: {} as Record<string, string>,
				code(status: number): TestHapiResponse {
					this.statusCode = status;
					return this;
				},
				header(name: string, value: string): TestHapiResponse {
					this.headers[name] = value;
					return this;
				}
			};
		}
	};
}
