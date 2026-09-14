import { describe, expect, it } from 'vitest';
import { deferred } from '../test-support/deferred.js';
import { mapRenderValue, withRenderCleanup } from './execution.js';

describe('shared render completion', () => {
	it('does not suspend available work and disposes it before returning', () => {
		const order: string[] = [];
		const result = withRenderCleanup(
			() =>
				mapRenderValue('ready', (value) => {
					order.push(value);
					return value;
				}),
			() => {
				order.push('disposed');
			}
		);
		expect(result).toBe('ready');
		expect(order).toEqual(['ready', 'disposed']);
	});

	it('keeps ownership until pending work and asynchronous cleanup settle', async () => {
		const work = deferred<string>();
		const cleanup = deferred<void>();
		let disposed = false;
		let completed = false;
		const result = withRenderCleanup(
			() => work.promise,
			() => {
				disposed = true;
				return cleanup.promise;
			}
		);
		void Promise.resolve(result).then(() => {
			completed = true;
		});
		expect(disposed).toBe(false);
		work.resolve('ready');
		await Promise.resolve();
		expect(disposed).toBe(true);
		expect(completed).toBe(false);
		cleanup.resolve();
		await expect(result).resolves.toBe('ready');
	});

	it.each([false, true])(
		'preserves a primary failure when cleanup fails (pending=%s)',
		async (pending) => {
			const primary = new Error('render failed');
			const cleanup = new Error('cleanup failed');
			await expect(
				(async () =>
					withRenderCleanup(
						() => {
							if (pending) return Promise.reject(primary);
							throw primary;
						},
						() => {
							if (pending) return Promise.reject(cleanup);
							throw cleanup;
						}
					))()
			).rejects.toBe(primary);
		}
	);
});
