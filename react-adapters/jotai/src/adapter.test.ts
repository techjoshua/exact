import { flushSync } from '@exact/reactive';
import { atom, createStore } from 'jotai/vanilla';
import { describe, expect, it } from 'vitest';
import { createAtomSource } from './index.js';

describe('@exact/jotai', () => {
	it('bridges vanilla atoms and stores', () => {
		const count = atom(0);
		const store = createStore();
		const source = createAtomSource(store, count);
		store.set(count, 2);
		flushSync();
		expect(source.value.get()).toBe(2);
		source.dispose();
	});
});
