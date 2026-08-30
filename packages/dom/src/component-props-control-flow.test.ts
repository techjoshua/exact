/**
 * @vitest-environment jsdom
 */
import { type Component } from '@exactjs/core';
import { createDynamicChild, createExpression } from '@exactjs/core/runtime/render';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { renderTestTree as render } from './testing.js';
import { createCompiledOperation } from './test-support/native-operations.js';

describe('@exactjs/dom component prop control flow', () => {
	it('keeps a compiled boolean prop reactive across conditional branch toggles', () => {
		let parent!: Component<{ open: boolean }>;

		function Menu(this: Component<{}>, props: { open: boolean }) {
			return () =>
				createCompiledOperation(
					'section',
					{},
					createDynamicChild(() => (props.open ? createCompiledOperation('div', {}, 'menu') : null))
				);
		}

		function Parent(this: Component<{ open: boolean }>) {
			parent = this;
			this.state.open = false;
			return () =>
				createCompiledOperation(Menu, {
					open: createExpression(() => this.state.open)
				});
		}

		const container = document.createElement('div');
		render(createCompiledOperation(Parent, {}), container);
		expect(container.querySelector('div')).toBeNull();

		parent.state.open = true;
		flushSync();
		expect(container.querySelector('div')).toBeTruthy();

		parent.state.open = false;
		flushSync();
		expect(container.querySelector('div')).toBeNull();
	});
});
