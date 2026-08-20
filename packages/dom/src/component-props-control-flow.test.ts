/**
 * @vitest-environment jsdom
 */
import { type Component } from '@exactjs/core';
import { createDynamicChild, createExpression } from '@exactjs/core/runtime/render';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { render } from './index.js';
import { createCompiledVNode } from './test-support/native-vnode.js';

describe('@exactjs/dom component prop control flow', () => {
	it('keeps a compiled boolean prop reactive across conditional branch toggles', () => {
		let parent!: Component<{ open: boolean }>;

		function Menu(this: Component<{}>, props: { open: boolean }) {
			return () =>
				createCompiledVNode(
					'section',
					{},
					createDynamicChild(() => (props.open ? createCompiledVNode('div', {}, 'menu') : null))
				);
		}

		function Parent(this: Component<{ open: boolean }>) {
			parent = this;
			this.state.open = false;
			return () =>
				createCompiledVNode(Menu, {
					open: createExpression(() => this.state.open)
				});
		}

		const container = document.createElement('div');
		render(createCompiledVNode(Parent, {}), container);
		expect(container.querySelector('div')).toBeNull();

		parent.state.open = true;
		flushSync();
		expect(container.querySelector('div')).toBeTruthy();

		parent.state.open = false;
		flushSync();
		expect(container.querySelector('div')).toBeNull();
	});
});
