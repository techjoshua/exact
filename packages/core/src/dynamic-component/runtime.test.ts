import { describe, expect, it } from 'vitest';
import { createEffectScope, flushSync, reactive, unwrap, withEffectScope } from '@exactjs/reactive';
import {
	exactComponentContract,
	exactComponentType,
	createExactFrameworkFixtureArtifact
} from '../component-contracts.js';
import { pageComponentDomain, withComponentDomain } from '../component/domain.js';
import type { Component } from '../component/contracts.js';
import { createDynamicComponent, dynamicComponentResolverFor } from './creation.js';
import {
	createCompiledDynamicComponent,
	createServerDynamicComponent,
	dynamicComponentValue
} from './runtime.js';

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
		const vnode = withEffectScope(scope, () =>
			createCompiledDynamicComponent({
				id: 'fixture:dynamic',
				source: () => Panel,
				props: { label: 'ready' }
			})
		);
		const rendered = unwrap(vnode.props.value) as { type: unknown; props: Record<string, unknown> };
		expect(rendered.type).toBe(Panel);
		expect(rendered.props.label).toBe('ready');
		expect((vnode.props.__exactDynamicComponent as { status: string }).status).toBe('available');
		scope.stop();
	});

	it('fences stale asynchronous candidates and aborts replaced generations', async () => {
		const selection = reactive({ value: 'first' });
		const settlements = new Map<string, (value: typeof Panel) => void>();
		const signals: AbortSignal[] = [];
		const scope = createEffectScope();
		const vnode = withEffectScope(scope, () =>
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
		expect(unwrap(vnode.props.value)).toEqual([]);
		selection.value = 'second';
		flushSync();
		expect(signals[0]?.aborted).toBe(true);
		settlements.get('first')?.(Panel);
		await Promise.resolve();
		expect((vnode.props.__exactDynamicComponent as { status: string }).status).toBe('pending');
		settlements.get('second')?.(Panel);
		await Promise.resolve();
		expect((unwrap(vnode.props.value) as { type: unknown }).type).toBe(Panel);
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
		const vnode = createServerDynamicComponent('fixture:server');
		expect(vnode.props.__exactDynamicComponent).toMatchObject({
			id: 'fixture:server',
			status: 'unassigned'
		});
		expect(() => unwrap(vnode.props.value)).toThrow('cannot resolve');
	});

	it('rejects candidates that carry any server execution authority', () => {
		const ServerPanel = Object.assign(
			function ServerPanel() {
				return () => 'server';
			},
			{
				[exactComponentType]: 'fixture:server-panel',
				[exactComponentContract]: {
					version: 2 as const,
					placement: 'server' as const,
					role: 'executor' as const,
					implementations: [],
					continuations: [],
					executors: [],
					boundaries: []
				}
			}
		);
		const scope = createEffectScope();
		const vnode = withEffectScope(scope, () =>
			createCompiledDynamicComponent({
				id: 'fixture:server-rejected',
				source: () => ServerPanel,
				props: {}
			})
		);
		expect(vnode.props.__exactDynamicComponent).toMatchObject({
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
