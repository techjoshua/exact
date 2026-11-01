import { describe, expect, it, vi } from 'vitest';
import { renderHydrationScript, renderToString } from './index.js';
import { LargeOutputComponent, NeverSettledComponent } from './limits.fixtures.test.js';
import { createOperation } from './test-support/native-operations.js';

describe('@exactjs/ssr limits', () => {
	it('rejects over-deep operation trees with a deterministic limit error', async () => {
		let operation = createOperation('span', null, 'leaf');
		for (let depth = 0; depth < 20; depth++) operation = createOperation('div', null, operation);

		await expect(renderToString(operation, { markers: false, maxTreeDepth: 8 })).rejects.toThrow(
			'eXact SSR tree exceeds the configured maximum depth of 8'
		);
	});

	it('bounds encoded string output and does not let component fallbacks swallow the limit', async () => {
		await expect(
			renderToString(createOperation(LargeOutputComponent, {}), {
				markers: false,
				maxOutputBytes: 9
			})
		).rejects.toThrow('eXact SSR output exceeds the configured maximum of 9 bytes');
	});

	it('leaves response expiration to the application abort signal', async () => {
		vi.useFakeTimers();
		try {
			const controller = new AbortController();
			const reason = new Error('application response expired');
			let settled = false;
			const rendering = renderToString(createOperation(NeverSettledComponent, {}), {
				signal: controller.signal
			});
			void rendering.then(
				() => {
					settled = true;
				},
				() => {
					settled = true;
				}
			);
			await vi.advanceTimersByTimeAsync(60_000);
			expect(settled).toBe(false);
			controller.abort(reason);
			await expect(rendering).rejects.toBe(reason);
			expect((await renderToString(createOperation('p', null, 'next'))).html).toContain('next');
		} finally {
			vi.useRealTimers();
		}
	});

	it('bounds hydration payload traversal and encoded size without invoking accessors', () => {
		const deep: Record<string, unknown> = {};
		let cursor = deep;
		for (let index = 0; index < 2_000; index++) {
			const next: Record<string, unknown> = {};
			cursor.next = next;
			cursor = next;
		}
		expect(() => renderHydrationScript({ state: deep })).toThrow(
			'Hydration payload must be JSON-serializable'
		);
		expect(() =>
			renderHydrationScript({ state: { text: 'x'.repeat(1_000) }, maxHydrationBytes: 64 })
		).toThrow('exceeded maxHydrationBytes');

		let reads = 0;
		const state = Object.create(Object.prototype);
		Object.defineProperty(state, 'danger', {
			enumerable: true,
			get() {
				reads++;
				return 'value';
			}
		});
		expect(() => renderHydrationScript({ state })).toThrow(
			'Hydration payload must be JSON-serializable'
		);
		expect(reads).toBe(0);
	});

	it('counts multibyte hydration payloads without retaining a second encoded buffer', () => {
		const state = { text: 'ready 😀' };
		const html = renderHydrationScript({ state });
		const payload = html.match(/>(.*)<\/script>/s)![1]!;
		const bytes = new TextEncoder().encode(payload).byteLength;

		expect(() => renderHydrationScript({ state, maxHydrationBytes: bytes })).not.toThrow();
		expect(() => renderHydrationScript({ state, maxHydrationBytes: bytes - 1 })).toThrow(
			'exceeded maxHydrationBytes'
		);
	});
});
