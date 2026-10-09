import { flushSync } from '@exactjs/reactive';
import { atom, createStore } from 'jotai/vanilla';
import { describe, expect, it } from 'vitest';
import { createAtomSource } from './index.js';

describe('@exactjs/jotai', () => {
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

it('keeps compiled server providers available with explicit and default stores', async () => {
	const { ExactJotaiProvider } = await import('../dist/server/adapter.js');
	const { createCompiledComponentReceipt } = await import(
		'@exactjs/core/runtime/component-operations'
	);
	const { renderToString } = await import('@exactjs/ssr');
	for (const store of [createStore(), undefined]) {
		const html = await renderToString(
			createCompiledComponentReceipt(ExactJotaiProvider, { store, children: 'Retained' })
		);
		expect(html.html).toContain('Retained');
	}
});
