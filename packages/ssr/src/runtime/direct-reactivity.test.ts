import { describe, expect, it } from 'vitest';
import { unwrap } from '@exactjs/reactive/framework/values';
import { directSsrReactive } from './direct-reactivity.js';

describe('direct SSR reactivity', () => {
	it('recomputes against current request-local state on every observation', () => {
		const state = { count: 1 };
		const doubled = directSsrReactive(() => state.count * 2);
		expect(doubled.get()).toBe(2);
		state.count = 3;
		expect(doubled.get()).toBe(6);
		expect(unwrap(doubled)).toBe(6);
		expect(JSON.stringify(doubled)).toBe('6');
	});

	it('retains ordinary primitive conversion behavior', () => {
		const label = directSsrReactive(() => 'ready');
		expect(String(label)).toBe('ready');
		expect(`${label}`).toBe('ready');
	});
});
