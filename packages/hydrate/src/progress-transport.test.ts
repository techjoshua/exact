/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { enqueueExactOperation } from './batching.js';
import { readExactStreamResponse } from './response/stream.js';

const operation = { type: 'invoke' as const, id: 'job' };
const start = { event: 'start', version: 1, operations: 1 };
const progress = {
	event: 'progress',
	version: 1,
	index: 0,
	type: 'invoke',
	id: 'job',
	receiver: 'progress',
	snapshot: { completed: 1 }
};
const result = {
	event: 'result',
	version: 1,
	index: 0,
	result: { ok: true, type: 'invoke', id: 'job', value: 'done' }
};
const complete = { event: 'complete', version: 1 };
function response(events: unknown[]) {
	return {
		body: new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(
					new TextEncoder().encode(events.map((event) => JSON.stringify(event)).join('\n') + '\n')
				);
				controller.close();
			}
		})
	};
}

describe('progress protocol trust boundary', () => {
	it('delivers an authorized snapshot and closes its observer at the terminal result', async () => {
		const seen: string[] = [];
		const observer = {
			receivers: ['progress'],
			report: vi.fn(() => seen.push('progress')),
			close: vi.fn(() => seen.push('close'))
		};
		const results = await readExactStreamResponse(
			response([start, progress, result, complete]),
			[operation],
			{ progress: [observer] }
		);
		expect(results[0]).toMatchObject({ value: 'done' });
		expect(observer.report).toHaveBeenCalledExactlyOnceWith('progress', { completed: 1 });
		expect(seen.slice(0, 2)).toEqual(['progress', 'close']);
	});
	it.each([
		{ ...progress, receiver: 'other' },
		{ ...progress, index: -1 },
		{ ...progress, id: 'other-job' },
		{ ...progress, opId: 'other-generation' },
		{ ...progress, snapshot: { text: 'x'.repeat(65_537) } },
		{ ...progress, snapshot: { text: '\u0000'.repeat(12_000) } },
		{ ...progress, extra: true }
	])('rejects malformed or unauthorized progress before activating a receiver', async (event) => {
		const observer = { receivers: ['progress'], report: vi.fn(), close: vi.fn() };
		await expect(
			readExactStreamResponse(response([start, event, result, complete]), [operation], {
				progress: [observer]
			})
		).rejects.toThrow();
		expect(observer.report).not.toHaveBeenCalled();
		expect(observer.close).toHaveBeenCalled();
	});
	it('rejects late progress and incomplete streams, closing active observers', async () => {
		for (const events of [
			[start, result, progress, complete],
			[start, progress]
		]) {
			const observer = { receivers: ['progress'], report: vi.fn(), close: vi.fn() };
			await expect(
				readExactStreamResponse(response(events), [operation], { progress: [observer] })
			).rejects.toThrow();
			expect(observer.close).toHaveBeenCalled();
		}
	});
});

it('routes interleaved batch progress by invocation and closes only the settled observer', async () => {
	const seen: string[] = [];
	const observer = (name: string) => ({
		receivers: ['progress'],
		report: () => seen.push(name),
		close: () => seen.push(name + ':close')
	});
	await readExactStreamResponse(
		response([
			{ ...start, operations: 2 },
			{ ...progress, opId: 'first' },
			{ ...result, result: { ...result.result, opId: 'first' } },
			{ ...progress, index: 1, opId: 'second' },
			{ ...result, index: 1, result: { ...result.result, opId: 'second' } },
			complete
		]),
		[
			{ ...operation, opId: 'first' },
			{ ...operation, opId: 'second' }
		],
		{
			progress: [observer('first'), observer('second')]
		}
	);
	expect(seen.slice(0, 4)).toEqual(['first', 'first:close', 'second', 'second:close']);
});

it('preserves progress observers in a microtask batch with a plain sibling', async () => {
	const observer = { receivers: ['progress'], report: vi.fn(), close: vi.fn() };
	const fetch = vi.fn(async (_url: string, _init?: RequestInit) => ({
		ok: true,
		status: 200,
		json: async () => null,
		...response([
			{ ...start, operations: 2 },
			{ ...progress, index: 1 },
			result,
			{ ...progress, index: 1, snapshot: { completed: 2 } },
			{ ...result, index: 1 },
			complete
		])
	}));
	const options = { endpoint: '/__exact', stream: true, fetch };
	const results = await Promise.all([
		enqueueExactOperation(document.createElement('div'), { ...options, operation }),
		enqueueExactOperation(document.createElement('div'), {
			...options,
			operation,
			progress: observer
		})
	]);
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string).type).toBe('batch');
	expect(results).toHaveLength(2);
	expect(results.every((result) => result.value === 'done')).toBe(true);
	expect(observer.report.mock.calls).toEqual([
		['progress', { completed: 1 }],
		['progress', { completed: 2 }]
	]);
	expect(observer.close).toHaveBeenCalled();
});
