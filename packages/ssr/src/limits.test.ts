import { createVNode, type Component } from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { renderHydrationScript, renderToString, renderToStringAsync } from './index.js';

describe('@exactjs/ssr limits', () => {
	it('rejects over-deep sync and async vnode trees with a deterministic limit error', async () => {
		let vnode = createVNode('span', null, 'leaf');
		for (let depth = 0; depth < 20; depth++) vnode = createVNode('div', null, vnode);

		expect(() => renderToString(vnode, { markers: false, maxTreeDepth: 8 })).toThrow(
			'eXact SSR tree exceeds the configured maximum depth of 8'
		);
		await expect(renderToStringAsync(vnode, { markers: false, maxTreeDepth: 8 })).rejects.toThrow(
			'eXact SSR tree exceeds the configured maximum depth of 8'
		);
	});

	it('bounds encoded string output and does not let component fallbacks swallow the limit', async () => {
		function Large() {
			return () => createVNode('p', null, 'éé');
		}

		expect(() =>
			renderToString(createVNode(Large, {}), { markers: false, maxOutputBytes: 9 })
		).toThrow('eXact SSR output exceeds the configured maximum of 9 bytes');
		await expect(
			renderToStringAsync(createVNode(Large, {}), { markers: false, maxOutputBytes: 9 })
		).rejects.toThrow('eXact SSR output exceeds the configured maximum of 9 bytes');
	});

	it('bounds the wall-clock duration of tasks that never settle', async () => {
		function Pending(this: Component<{}>) {
			(this as any).task(() => new Promise<void>(() => undefined));
			return () => createVNode('p', null, 'Loading');
		}

		await expect(
			renderToStringAsync(createVNode(Pending, {}), { maxTaskDurationMs: 10 })
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
});
