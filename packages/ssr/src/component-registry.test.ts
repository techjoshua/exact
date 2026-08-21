import { Suspense, type Component } from '@exactjs/core';
import { createCompiledComponentRegistry } from '@exactjs/core/runtime/registry';
import { markExactComponent } from '@exactjs/core/framework/component-contracts';
import { describe, expect, it, vi } from 'vitest';

import { renderToString, renderToStringAsync } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

function Eager(this: Component<Record<string, never>>, props: { label: string }) {
	return () => createVNode('p', null, `eager:${props.label}`);
}

function Lazy(this: Component<Record<string, never>>, props: { label: string }) {
	return () => createVNode('p', null, `lazy:${props.label}`);
}

markExactComponent(Eager, '@exactjs/ssr:test:Eager');
markExactComponent(Lazy, '@exactjs/ssr:test:Lazy');

describe('@exactjs/ssr component registries', () => {
	it('renders eager registry members through their stable selection facade', () => {
		const View = createCompiledComponentRegistry('test:ssr:eager', 'EagerView', 'server', () => ({
			eager: Eager
		}));
		const output = renderToString(createVNode(View.eager, { label: 'ready' }));

		expect(output.html).toContain('eager:ready');
		expect(output.html).toContain('exact:component');
	});

	it('loads a lazy selected server entry through Suspense readiness', async () => {
		const load = vi.fn(async () => Lazy);
		const View = createCompiledComponentRegistry('test:ssr:lazy', 'LazyView', 'server', ({ lazy }) => ({
			lazy: lazy(load)
		}));
		const output = await renderToStringAsync(
			createVNode(
				Suspense,
				{ fallback: createVNode('p', null, 'loading') },
				createVNode(View.lazy, { label: 'ready' })
			)
		);

		expect(output.html).toContain('lazy:ready');
		expect(output.html).not.toContain('loading');
		expect(load).toHaveBeenCalledTimes(1);
	});
});
