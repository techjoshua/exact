import { Suspense, createComponentRegistry, createVNode, type Component } from '@exactjs/core';
import { describe, expect, it, vi } from 'vitest';

import { renderToString, renderToStringAsync } from './index.js';

function Eager(this: Component<Record<string, never>>, props: { label: string }) {
	return () => createVNode('p', null, `eager:${props.label}`);
}

function Lazy(this: Component<Record<string, never>>, props: { label: string }) {
	return () => createVNode('p', null, `lazy:${props.label}`);
}

describe('@exactjs/ssr component registries', () => {
	it('renders eager registry members through their stable selection facade', () => {
		const View = createComponentRegistry(() => ({ eager: Eager }));
		const output = renderToString(createVNode(View.eager, { label: 'ready' }));

		expect(output.html).toContain('eager:ready');
		expect(output.html).toContain('ComponentRegistry.eager');
	});

	it('loads a lazy selected server entry through Suspense readiness', async () => {
		const load = vi.fn(async () => Lazy);
		const View = createComponentRegistry(({ lazy }) => ({
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
