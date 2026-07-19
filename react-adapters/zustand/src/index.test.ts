import { flushSync } from '@exact/reactive';
import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createZustandSource } from './index.js';

describe('@exact/zustand', () => {
	it('bridges vanilla store selections', () => {
		const store = createStore(() => ({ count: 1, label: 'one' }));
		const source = createZustandSource(store, (state) => state.count);
		source.connect();
		store.setState({ count: 2 });
		flushSync();
		expect(source.value.get()).toBe(2);
		source.dispose();
	});
});
