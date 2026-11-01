import { describe, expect, it, vi, type TestContext } from 'vitest';
import { ownCorpusCompilation } from './compiler-case.js';

function compilationOwner(signal: AbortSignal) {
	let finish = () => {};
	const context = {
		signal,
		task: { name: 'finite fixture compilation' },
		onTestFinished: (cleanup: () => void) => {
			finish = cleanup;
		}
	} as TestContext;
	return { context, finish: () => finish() };
}

describe('corpus compilation ownership', () => {
	it('warns about elapsed work and clears its warning on test completion', async () => {
		vi.useFakeTimers();
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const owner = compilationOwner(new AbortController().signal);
		try {
			const compile = ownCorpusCompilation(owner.context);
			expect(await compile(() => 42)).toBe(42);
			vi.advanceTimersByTime(30_000);
			expect(warning).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('30 seconds'));
			owner.finish();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			owner.finish();
			warning.mockRestore();
			vi.useRealTimers();
		}
	});

	it('does not start a fixture for an already canceled case', () => {
		const controller = new AbortController();
		const reason = new Error('canceled case');
		controller.abort(reason);
		expect(() => ownCorpusCompilation(compilationOwner(controller.signal).context)).toThrow(reason);
	});

	it('fences late completion before assertions or another fixture can resume', async () => {
		const controller = new AbortController();
		const owner = compilationOwner(controller.signal);
		const compile = ownCorpusCompilation(owner.context);
		const reason = new Error('retired case');
		let release!: () => void;
		let resumed = false;
		const work = compile(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		).then(() => {
			resumed = true;
		});
		try {
			controller.abort(reason);
			owner.finish();
			release();
			await expect(work).rejects.toBe(reason);
			expect(resumed).toBe(false);
			const next = vi.fn();
			await expect(compile(next)).rejects.toBe(reason);
			expect(next).not.toHaveBeenCalled();
		} finally {
			owner.finish();
			release();
		}
	});
});
