import { describe, expect, it, vi } from 'vitest';
import { createProgressStream, type ExactProgressStreamWriter } from './progress/stream.js';
import { captureProgressSnapshot } from './progress/snapshot.js';

function gate() {
	let resolve!: () => void;
	const promise = new Promise<void>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}
const decode = (bytes: Uint8Array | undefined) => JSON.parse(new TextDecoder().decode(bytes));
const snapshot = (index: number, receiver: string, value: number) => ({
	event: 'progress' as const,
	version: 1 as const,
	index,
	type: 'invoke' as const,
	id: `operation-${index}`,
	receiver,
	snapshot: value
});

describe('backpressured progress snapshots', () => {
	it('replaces unsent reports and isolates receivers and operations', async () => {
		const ready = gate();
		const finish = gate();
		let writer!: ExactProgressStreamWriter;
		const dispose = vi.fn();
		const stream = createProgressStream(
			async (current) => {
				writer = current;
				ready.resolve();
				await finish.promise;
			},
			{
				signal: new AbortController().signal,
				cancel: vi.fn(),
				dispose
			}
		);
		await ready.promise;
		for (let value = 0; value < 1000; value++) writer.report(snapshot(0, 'a', value));
		writer.report(snapshot(0, 'b', 2));
		writer.report(snapshot(1, 'a', 3));
		const reader = stream.getReader();
		expect(decode((await reader.read()).value)).toMatchObject({
			index: 0,
			receiver: 'a',
			snapshot: 999
		});
		expect(decode((await reader.read()).value)).toMatchObject({
			index: 0,
			receiver: 'b',
			snapshot: 2
		});
		expect(decode((await reader.read()).value)).toMatchObject({
			index: 1,
			receiver: 'a',
			snapshot: 3
		});
		finish.resolve();
		expect((await reader.read()).done).toBe(true);
		expect(dispose).toHaveBeenCalledOnce();
	});

	it('discards pending progress at settlement and gives ordinary output precedence', async () => {
		const ready = gate();
		const finish = gate();
		let writer!: ExactProgressStreamWriter;
		const stream = createProgressStream(
			async (current) => {
				writer = current;
				ready.resolve();
				await finish.promise;
				writer.finishProgress(0);
				await writer.emit({ event: 'complete', version: 1 });
			},
			{ signal: new AbortController().signal, cancel: vi.fn(), dispose() {} }
		);
		await ready.promise;
		writer.report(snapshot(0, 'a', 1));
		finish.resolve();
		await Promise.resolve();
		const reader = stream.getReader();
		expect(decode((await reader.read()).value)).toEqual({ event: 'complete', version: 1 });
		expect((await reader.read()).done).toBe(true);
	});

	it('releases a producer blocked on ordinary output when the reader disconnects', async () => {
		const started = gate();
		const settled = gate();
		const cancel = vi.fn();
		const dispose = vi.fn();
		const stream = createProgressStream(
			async (writer) => {
				started.resolve();
				try {
					await writer.emit({ event: 'complete', version: 1 });
				} finally {
					settled.resolve();
				}
			},
			{ signal: new AbortController().signal, cancel, dispose }
		);
		await started.promise;
		await stream.cancel('gone');
		await settled.promise;
		expect(cancel).toHaveBeenCalledExactlyOnceWith('gone');
		expect(dispose).toHaveBeenCalledOnce();
	});

	it('captures snapshots at report time and rejects invalid or oversized values', () => {
		const source = { current: new Map([['completed', 1]]) };
		const captured = captureProgressSnapshot(source);
		source.current.set('completed', 2);
		expect(captured).toEqual({ current: new Map([['completed', 1]]) });
		for (const value of [undefined, () => {}, { count: NaN }, { text: 'x'.repeat(65_537) }])
			expect(() => captureProgressSnapshot(value)).toThrow();
		const cycle: { self?: unknown } = {};
		cycle.self = cycle;
		expect(() => captureProgressSnapshot(cycle)).toThrow();
	});
});
