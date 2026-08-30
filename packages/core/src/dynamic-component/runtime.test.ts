import { describe, expect, it } from 'vitest';
import { createEffectScope, flushSync, reactive, unwrap, withEffectScope } from '@exactjs/reactive';
import { createExactFrameworkFixtureArtifact } from '../testing/runtime-artifacts.js';
import { pageComponentDomain, withComponentDomain } from '../component/domain.js';
import type { Component } from '../component/contracts.js';
import { createDynamicComponent, dynamicComponentResolverFor } from './creation.js';
import {
	createCompiledDynamicComponent,
	createServerDynamicComponent,
	dynamicComponentValue
} from './runtime.js';
import { readChildRangeReceipt } from '../component-abi/child-range-receipt.js';
import { readCompiledComponentReceipt } from '../component-abi/receipt.js';

function Panel(this: Component<{}>) {
	return () => 'panel';
}
createExactFrameworkFixtureArtifact(Panel, 'fixture:panel');

describe('dynamic component boundaries', () => {
	it('requires an owning component setup domain', () => {
		expect(() => createDynamicComponent(() => Panel)).toThrow('component setup');
		const facade = withComponentDomain(pageComponentDomain, () =>
			createDynamicComponent(() => Panel)
		);
		expect(dynamicComponentResolverFor(facade)).toBeTypeOf('function');
	});

	it('publishes synchronous candidates through the canonical dynamic value', () => {
		const scope = createEffectScope();
		const receipt = withEffectScope(scope, () =>
			createCompiledDynamicComponent({
				id: 'fixture:dynamic',
				source: () => Panel,
				props: { label: 'ready' }
			})
		);
		const data = readChildRangeReceipt(receipt)!;
		const rendered = readCompiledComponentReceipt(unwrap(data.value));
		expect(rendered?.contract.artifact.id).toBe('fixture:panel');
		expect(rendered?.props.label).toBe('ready');
		expect(data.dynamicComponent?.inspection.status).toBe('available');
		scope.stop();
	});

	it('fences stale asynchronous candidates and aborts replaced generations', async () => {
		const selection = reactive({ value: 'first' });
		const settlements = new Map<string, (value: typeof Panel) => void>();
		const signals: AbortSignal[] = [];
		const scope = createEffectScope();
		const receipt = withEffectScope(scope, () =>
			createCompiledDynamicComponent({
				id: 'fixture:async',
				source: (signal: AbortSignal) => {
					signals.push(signal);
					const key = selection.value;
					return new Promise<typeof Panel>((resolve) => settlements.set(key, resolve));
				},
				props: {}
			})
		);
		const data = readChildRangeReceipt(receipt)!;
		expect(unwrap(data.value)).toEqual([]);
		selection.value = 'second';
		flushSync();
		expect(signals[0]?.aborted).toBe(true);
		settlements.get('first')?.(Panel);
		await Promise.resolve();
		expect(data.dynamicComponent?.inspection.status).toBe('pending');
		settlements.get('second')?.(Panel);
		await Promise.resolve();
		expect(readCompiledComponentReceipt(unwrap(data.value))?.contract.artifact.id).toBe(
			'fixture:panel'
		);
		scope.stop();
		expect(signals[1]?.aborted).toBe(true);
	});

	it('releases every superseded resolver generation during sustained replacement', () => {
		const selection = reactive({ value: 0 });
		const signals: AbortSignal[] = [];
		const scope = createEffectScope();
		withEffectScope(scope, () =>
			createCompiledDynamicComponent({
				id: 'fixture:replacement-churn',
				source: (signal: AbortSignal) => {
					signals.push(signal);
					void selection.value;
					return Panel;
				},
				props: {}
			})
		);
		for (let generation = 1; generation <= 512; generation++) {
			selection.value = generation;
			flushSync();
		}
		expect(signals).toHaveLength(513);
		expect(signals.slice(0, -1).every((signal) => signal.aborted)).toBe(true);
		expect(signals.at(-1)?.aborted).toBe(false);
		scope.stop();
		expect(signals.at(-1)?.aborted).toBe(true);
	});

	it('keeps server projections inert', () => {
		const receipt = createServerDynamicComponent('fixture:server');
		const data = readChildRangeReceipt(receipt)!;
		expect(data.dynamicComponent?.inspection).toMatchObject({
			id: 'fixture:server',
			status: 'unassigned'
		});
		expect(data.value).toBeUndefined();
	});

	it('rejects candidates that carry any server execution authority', () => {
		const ServerPanel = createExactFrameworkFixtureArtifact(
			function ServerPanel() {
				return () => 'server';
			},
			'fixture:server-panel',
			'server'
		);
		const scope = createEffectScope();
		const receipt = withEffectScope(scope, () =>
			createCompiledDynamicComponent({
				id: 'fixture:server-rejected',
				source: () => ServerPanel,
				props: {}
			})
		);
		expect(readChildRangeReceipt(receipt)?.dynamicComponent?.inspection).toMatchObject({
			status: 'failed',
			error: expect.objectContaining({ message: expect.stringContaining('server execution') })
		});
		scope.stop();
	});

	it('rejects isomorphic server-render artifacts from client dynamic selection', () => {
		const ServerRenderPanel = createExactFrameworkFixtureArtifact(
			function ServerRenderPanel() {
				return () => 'server';
			},
			'fixture:server-render-panel',
			'server'
		);
		const scope = createEffectScope();
		const receipt = withEffectScope(scope, () =>
			createCompiledDynamicComponent({
				id: 'fixture:server-render-rejected',
				source: () => ServerRenderPanel,
				props: {}
			})
		);
		expect(readChildRangeReceipt(receipt)?.dynamicComponent?.inspection).toMatchObject({
			status: 'failed',
			error: expect.objectContaining({ message: expect.stringContaining('server execution') })
		});
		scope.stop();
	});

	it('unwraps compiler-observed annotated values', () => {
		const resolver = dynamicComponentValue(() => Panel);
		expect(resolver(new AbortController().signal)).toBe(Panel);
	});
});
