/** @vitest-environment jsdom */
import { it, expect, vi } from 'vitest';
import { enqueueExactOperation } from './batching.js';
import type { FetchLike } from './types.js';
for (const cancel of [0, 1])
	it('keeps canceled batch observer closed at position ' + cancel, async () => {
		const controllers = [new AbortController(), new AbortController()];
		const seen = [[] as number[], [] as number[]];
		let wire!: ReadableStreamDefaultController<Uint8Array>;
		let transport!: AbortSignal | undefined;
		const response = {
			ok: true,
			status: 200,
			json: async () => null,
			body: new ReadableStream<Uint8Array>({
				start(c) {
					wire = c;
				}
			})
		};
		const fetch: FetchLike = vi.fn(async (_u, init) => {
			transport = init.signal;
			return response;
		});
		const observers = seen.map((values) => ({
			receivers: ['progress'],
			report: (_r: string, x: unknown) => values.push(x as number),
			close: vi.fn()
		}));
		const pending = controllers.map((c, i) =>
			enqueueExactOperation(document.createElement('div'), {
				endpoint: '/same',
				fetch,
				signal: c.signal,
				stream: true,
				operation: { type: 'invoke', id: 'job', root: 'root' + i },
				progress: observers[i]
			}).then(
				(value) => ({ value }),
				(error) => ({ error })
			)
		);
		const emit = (event: unknown) =>
			wire.enqueue(new TextEncoder().encode(JSON.stringify(event) + '\n'));
		try {
			await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
			emit({ event: 'start', version: 1, operations: 2 });
			for (let i = 0; i < 2; i++)
				emit({
					event: 'progress',
					version: 1,
					index: i,
					type: 'invoke',
					id: 'job',
					receiver: 'progress',
					snapshot: 1
				});
			await vi.waitFor(() => expect(seen).toEqual([[1], [1]]));
			controllers[cancel].abort('only mine');
			expect(transport?.aborted).toBe(false);
			for (let i = 0; i < 2; i++)
				emit({
					event: 'progress',
					version: 1,
					index: i,
					type: 'invoke',
					id: 'job',
					receiver: 'progress',
					snapshot: 2
				});
			for (let i = 1; i >= 0; i--)
				emit({
					event: 'result',
					version: 1,
					index: i,
					result: { ok: true, type: 'invoke', id: 'job', value: i }
				});
			emit({ event: 'complete', version: 1 });
			wire.close();
			const results = await Promise.all(pending);
			expect(results[cancel]).toEqual({ error: 'only mine' });
			expect(results[1 - cancel]).toEqual({ value: { value: 1 - cancel } });
			expect(seen[cancel]).toEqual([1]);
			expect(seen[1 - cancel]).toEqual([1, 2]);
			expect(observers[cancel].close).toHaveBeenCalledTimes(1);
		} finally {
			controllers.forEach((c) => c.abort('cleanup'));
			await Promise.all(pending);
		}
	});
