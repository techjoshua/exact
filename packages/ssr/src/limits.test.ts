import { describe, expect, it } from 'vitest';
import { renderHydrationScript, renderToString, renderToStringAsync } from './index.js';
import { LargeOutputComponent, NeverSettledComponent } from './limits.fixtures.test.js';
import { createOperation } from './test-support/native-operations.js';

describe('@exactjs/ssr limits', () => {
	it('rejects over-deep sync and async operation trees with a deterministic limit error', async () => {
		let operation = createOperation('span', null, 'leaf');
		for (let depth = 0; depth < 20; depth++) operation = createOperation('div', null, operation);

		expect(() => renderToString(operation, { markers: false, maxTreeDepth: 8 })).toThrow(
			'eXact SSR tree exceeds the configured maximum depth of 8'
		);
		await expect(
			renderToStringAsync(operation, { markers: false, maxTreeDepth: 8 })
		).rejects.toThrow('eXact SSR tree exceeds the configured maximum depth of 8');
	});

	it('bounds encoded string output and does not let component fallbacks swallow the limit', async () => {
		expect(() =>
			renderToString(createOperation(LargeOutputComponent, {}), {
				markers: false,
				maxOutputBytes: 9
			})
		).toThrow('eXact SSR output exceeds the configured maximum of 9 bytes');
		await expect(
			renderToStringAsync(createOperation(LargeOutputComponent, {}), {
				markers: false,
				maxOutputBytes: 9
			})
		).rejects.toThrow('eXact SSR output exceeds the configured maximum of 9 bytes');
	});

	it('bounds the wall-clock duration of tasks that never settle', async () => {
		await expect(
			renderToStringAsync(createOperation(NeverSettledComponent, {}), { maxTaskDurationMs: 10 })
		).rejects.toThrow('SSR task duration limit exceeded');
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
