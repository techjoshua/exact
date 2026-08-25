import { Suspense, type Component } from '@exactjs/core';
import { createCompiledComponentRegistry } from '@exactjs/core/runtime/registry';
import {
	createExactFrameworkFixtureArtifact,
	readExactCompiledComponentContract
} from '@exactjs/core/framework/component-contracts';
import { describe, expect, it, vi } from 'vitest';

import { renderToString, renderToStringAsync } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

function Eager(this: Component<Record<string, never>>, props: { label: string }) {
	return () => createVNode('p', null, `eager:${props.label}`);
}

function Lazy(this: Component<Record<string, never>>, props: { label: string }) {
	return () => createVNode('p', null, `lazy:${props.label}`);
}

createExactFrameworkFixtureArtifact(Eager, '@exactjs/ssr:test:Eager');
createExactFrameworkFixtureArtifact(Lazy, '@exactjs/ssr:test:Lazy');

describe('@exactjs/ssr component registries', () => {
	it('renders eager registry members through their stable selection facade', () => {
		let direct = 0;
		let generic = 0;
		const View = createCompiledComponentRegistry('test:ssr:eager', 'EagerView', 'server', () => ({
			eager: Eager
		}));
		expect(readExactCompiledComponentContract(View.eager).definition.server).toMatchObject({
			classification: 'synchronous',
			lane: 'direct',
			render: View.eager
		});
		const output = renderToString(createVNode(View.eager, { label: 'ready' }), {
			onDirectComponentCreated: () => direct++,
			onComponentCreated: () => generic++
		});

		expect(output.html).toContain('eager:ready');
		expect(output.html).toContain('exact:component');
		expect(direct).toBe(1);
		expect(generic).toBe(1);
	});

	it('loads a lazy selected server entry through Suspense readiness', async () => {
		const load = vi.fn(async () => Lazy);
		const View = createCompiledComponentRegistry(
			'test:ssr:lazy',
			'LazyView',
			'server',
			({ lazy }) => ({
				lazy: lazy(load)
			})
		);
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
