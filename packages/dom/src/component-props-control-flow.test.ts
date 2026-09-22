/**
 * @vitest-environment jsdom
 */
import { type Component } from '@exactjs/core';
import { createDynamicChild, createExpression } from '@exactjs/core/runtime/render';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { renderTestTree as render } from './testing.js';
import { unmount } from './root.js';
import { createCompiledOperation } from './test-support/native-operations.js';
import {
	OptionalDetailOwner,
	StatefulOptionalDetailOwner,
	optionalDetailOwnerInstance
} from './test-support/components/optional-detail.fixtures.js';

describe('@exactjs/dom component prop control flow', () => {
	it.each([
		['forwarded prop', OptionalDetailOwner],
		['local state', StatefulOptionalDetailOwner]
	] as const)(
		'retires guarded %s readers before a selected resource becomes absent',
		(_name, Fixture) => {
			const container = document.createElement('div');
			render(createCompiledOperation(Fixture, {}), container);
			try {
				expect(container.textContent).toBe('selectedready');
				if (Fixture === OptionalDetailOwner) {
					optionalDetailOwnerInstance().state.entries[0]!.comments = [];
					flushSync();
					expect(container.textContent).toBe('selectedNo comments');
					optionalDetailOwnerInstance().state.entries[0]!.comments.push({
						id: 'added',
						body: 'added'
					});
					flushSync();
					expect(container.textContent).toBe('selectedadded');
				}
				optionalDetailOwnerInstance().state.entries = [];
				flushSync();
				expect(container.textContent).toBe('empty');
				optionalDetailOwnerInstance().state.entries = [
					{ id: 'selected', comments: [{ id: 'new', body: 'restored' }] }
				];
				flushSync();
				expect(container.textContent).toBe('selectedrestored');
			} finally {
				unmount(container);
			}
		}
	);

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
