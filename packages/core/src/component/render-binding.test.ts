import { unwrap } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { createExpression } from '../vnode.js';
import { renderInstance } from './render.js';
import { createComponentInstance, createFrameworkFixtureComponentInstance } from './runtime.js';

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
});
