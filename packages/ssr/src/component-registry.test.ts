import { Suspense } from '@exactjs/core';
import { createCompiledComponentRegistry } from '@exactjs/core/runtime/registry';
import { readExactServerExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import { describe, expect, it, vi } from 'vitest';

import { renderToString, renderToStringAsync } from './index.js';
import { createOperation } from './test-support/native-operations.js';
import {
	EagerRegistryComponent as Eager,
	LazyRegistryComponent as Lazy
} from './component-registry.fixtures.test.js';

describe('@exactjs/ssr component registries', () => {
	it('renders eager registry members through their stable selection facade', () => {
		let direct = 0;
		let generic = 0;
		const View = createCompiledComponentRegistry('test:ssr:eager', 'EagerView', 'server', () => ({
			eager: Eager
		}));
		const selectedArtifact = readExactServerExecutableComponentContract(Eager).artifact;
		const registryArtifact = readExactServerExecutableComponentContract(View.eager).artifact;
		expect(registryArtifact.execution).toEqual(selectedArtifact.execution);
		expect(registryArtifact.instantiate).toBe(selectedArtifact.instantiate);
		expect(registryArtifact.id).toBe('test:ssr:eager:eager');
		const output = renderToString(createOperation(View.eager, { label: 'ready' }), {
			onDirectComponentCreated: () => direct++,
			onComponentCreated: () => generic++
		});

		expect(output.html).toMatch(/eager:.*ready/u);
		expect(output.html).toContain('exact:component');
		expect(direct).toBe(1);
		expect(generic).toBe(0);
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
			createOperation(
				Suspense,
				{ fallback: createOperation('p', null, 'loading') },
				createOperation(View.lazy, { label: 'ready' })
			)
		);
		const artifact = readExactServerExecutableComponentContract(View.lazy).artifact;

		expect(output.html).toMatch(/lazy:.*ready/u);
		expect(output.html).not.toContain('loading');
		expect(load).toHaveBeenCalledTimes(1);
		expect(artifact.execution).toEqual({
			version: 1,
			classification: 'synchronous',
			lane: 'direct'
		});
		expect(artifact.selection?.key).toBe('lazy');
	});
});
