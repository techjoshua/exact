import { createFrameworkFixtureComponentInstance } from '../testing.js';
import { flushSync, unwrap, watch } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { createExpression } from './reactive-expressions.js';
import {
	exactComponentContract,
	exactComponentType,
	readExactClientExecutableComponentContract
} from '../component-contracts.js';
import type { Component, ComponentFunction } from './contracts.js';
import { renderInstance } from './render.js';
import { createComponentInstance } from './runtime.js';
import { constructRenderComponentInstance } from './render-instance-construction.js';
import {
	attachExactCompiledClientComponent,
	disposeExactClientComponent,
	receiveExactClientComponentProps
} from '../component-abi/compiled-runtime.js';

describe('component render binding', () => {
	it('preserves the render arrow lexical receiver', () => {
		const lexical = { label: 'lexical' };
		const Arrow = () => () => lexical.label;

		expect(
			renderInstance(createFrameworkFixtureComponentInstance(Arrow, {}), () => undefined)
		).toEqual(['lexical']);
	});

	it('rejects an uncompiled direct-view component at the runtime boundary', () => {
		const Direct = (() => 'view') as unknown as () => () => string;
		expect(() => createComponentInstance(Direct, {})).toThrow(
			'Native eXact component execution requires a compiled component artifact'
		);
	});

	it('owns compiler-created render expressions through component teardown', () => {
		const View = function (this: { state: { value: string } }) {
			this.state.value = 'owned';
			return () => unwrap(createExpression(() => this.state.value));
		};
		const instance = createFrameworkFixtureComponentInstance(View, {});
		const scope = instance.scope as typeof instance.scope & {
			readonly reactions: ReadonlySet<unknown>;
		};

		expect(renderInstance(instance, () => undefined)).toEqual(['owned']);
		expect(scope.reactions).toHaveLength(2);

		instance.unmount();
		expect(scope.active).toBe(false);
		expect(scope.reactions).toHaveLength(0);
	});

	it('does not retain a generic render watcher for compiler-owned live readers', () => {
		let invalidations = 0;
		const implementation = function Direct(this: Component<{ value: string }>) {
			this.state.value = 'direct';
			return () => this.state.value;
		};
		const Direct = Object.assign(implementation, {
			[exactComponentType]: 'test:direct-render',
			[exactComponentContract]: {
				version: 3 as const,
				placement: 'client' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				execution: { version: 1 as const, ports: [], transitions: [], reactive: [] },
				artifact: {
					version: 1 as const,
					target: 'client' as const,
					id: 'test:direct-render',
					attach: attachExactCompiledClientComponent,
					receive: receiveExactClientComponentProps,
					dispose: disposeExactClientComponent,
					instantiate: implementation,
					construct: constructRenderComponentInstance,
					abi: 1,
					state: ['value'],
					props: ['first', 'second', 'children'],
					capabilities: []
				}
			}
		}) as ComponentFunction<{ value: string }, Record<string, unknown>>;
		const instance = createComponentInstance(Direct, {
			first: 'initial',
			second: 'remove'
		});
		const scope = instance.scope as typeof instance.scope & {
			readonly reactions: ReadonlySet<unknown>;
		};

		expect(renderInstance(instance, () => invalidations++)).toEqual(['direct']);
		expect(scope.reactions).toHaveLength(0);
		let receipts = 0;
		watch(
			() => `${String(instance.props.first)}:${String(instance.props.second)}`,
			() => receipts++,
			{ scope: instance.scope }
		);
		readExactClientExecutableComponentContract(Direct).artifact.receive(
			instance,
			{ first: 'received' },
			['owned-child']
		);
		flushSync();
		expect(instance.props.first).toBe('received');
		expect('second' in instance.props).toBe(false);
		expect(instance.props.children).toBe('owned-child');
		expect(receipts).toBe(1);
		instance.state.value = 'updated';
		expect(invalidations).toBe(0);
		instance.unmount();
	});
});
