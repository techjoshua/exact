import { describe, expect, it, vi } from 'vitest';
import { ExactBuildUnsupportedError, invokeExact } from './index.js';

describe('build compatibility responses', () => {
	it('reports a preferred build before consuming a successful response', async () => {
		const onResponse = vi.fn();
		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'action',
				root: 'catalog#card',
				id: 'save',
				onResponse,
				fetch: async () => ({
					ok: true,
					status: 200,
					headers: new Headers({
						'X-Exact-Preferred-Build': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
					}),
					async json() {
						return { ok: true, type: 'action', id: 'save' };
					}
				})
			})
		).resolves.toEqual({});

		expect(onResponse).toHaveBeenCalledWith({
			status: 200,
			preferredBuildKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
		});
	});

	it('uses a typed error only for the reserved unsupported-build response', async () => {
		const request = (body: unknown) =>
			invokeExact({
				endpoint: '/__exact',
				type: 'action',
				root: 'catalog#card',
				id: 'save',
				fetch: async () => ({
					ok: false,
					status: 410,
					async json() {
						return body;
					}
				})
			});

		await expect(request({ error: 'exact_build_unsupported' })).rejects.toBeInstanceOf(
			ExactBuildUnsupportedError
		);
		await expect(request({ error: 'gone' })).rejects.toThrow('eXact action invocation failed');
	});
});
