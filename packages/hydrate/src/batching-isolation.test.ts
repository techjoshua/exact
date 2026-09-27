/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
import { createExactClient } from './index.js';
import { testContinuation } from './test-support/responses.js';
import type { FetchLike } from './types.js';

it.each(['abort', 'observer'] as const)(
	"isolates a root's %s failure from another root sharing its request",
	async (failure) => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const controller = new AbortController();
		const callbacks: number[] = [];
		let signal: AbortSignal | undefined;
		const fetch: FetchLike = vi.fn(async (_url, init) => {
			signal = init.signal;
			await gate;
			const operations = JSON.parse(init.body).operations as { type: string; id: string }[];
			return {
				ok: true,
				status: 200,
				json: async () => ({
					ok: true,
					version: 1,
					results: operations.map(({ type, id }) => ({ type, id, ok: true }))
				})
			};
		});
		const clients = [0, 1].map((index) =>
			createExactClient(document.createElement('main'), {
				endpoint: '/isolation',
				fetch,
				signal: index === 0 ? controller.signal : undefined,
				continuations: { job: testContinuation('job') },
				onResponse() {
					callbacks.push(index);
					if (index === 0 && failure === 'observer') throw new Error('local callback');
				}
			})
		);
		const done: boolean[] = [];
		const results = clients.map((client, index) =>
			client.invokeTask('job').then(
				(value) => {
					done[index] = true;
					return { value };
				},
				(error: unknown) => {
					done[index] = true;
					return { error };
				}
			)
		);
		try {
			await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
			if (failure === 'abort') {
				controller.abort('only this root');
				await vi.waitFor(() => expect(done[0]).toBe(true));
				expect(done[1]).not.toBe(true);
				expect(signal?.aborted ?? false).toBe(false);
			}
			release();
			const values = await Promise.all(results);
			expect(values[0]).toEqual({
				error: failure === 'abort' ? 'only this root' : new Error('local callback')
			});
			expect(values[1]).toEqual({ value: {} });
			expect(callbacks).toEqual(failure === 'abort' ? [1] : [0, 1]);
		} finally {
			release();
			await Promise.all(results);
			for (const client of clients) client.dispose();
		}
	}
);
