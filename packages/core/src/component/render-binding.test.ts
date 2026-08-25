import { unwrap } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { createExpression } from './reactive-vnodes.js';
import { exactComponentContract, exactComponentType } from '../component-contracts.js';
import type { Component, ComponentFunction } from './contracts.js';
import { renderInstance } from './render.js';
import { createComponentInstance, createFrameworkFixtureComponentInstance } from './runtime.js';
import { constructRenderComponentInstance } from './render-instance-construction.js';

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
				version: 2 as const,
				placement: 'client' as const,
				role: 'client' as const,
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: [],
				execution: { version: 1 as const, ports: [], transitions: [], reactive: [] },
				definition: {
					version: 1 as const,
					instantiate: implementation,
					construct: constructRenderComponentInstance,
					abi: 1,
					state: ['value'],
					capabilities: []
				}
			}
		}) as ComponentFunction<{ value: string }, Record<string, unknown>>;
		const instance = createComponentInstance(Direct, {});
		const scope = instance.scope as typeof instance.scope & {
			readonly reactions: ReadonlySet<unknown>;
		};

		expect(renderInstance(instance, () => invalidations++)).toEqual(['direct']);
		expect(scope.reactions).toHaveLength(0);
		instance.state.value = 'updated';
		expect(invalidations).toBe(0);
		instance.unmount();
	});
});
