/** @vitest-environment jsdom */
import '@exactjs/core/runtime/lists';
import { type Component } from '@exactjs/core';
import { createExpression } from '@exactjs/core/runtime/render';
import {
	currentEffectScope,
	registerEffectScopeCleanup
} from '@exactjs/reactive/framework/runtime';
import { flushSync } from '@exactjs/reactive';
import { expect, it } from 'vitest';
import { jsx } from './test-support/native-operations.js';
import { unmount } from './renderer/root-disposal.js';
import { renderTestTree } from './testing.js';

it.each([false, true])('retains keyed DOM and child ownership with fresh items (%s)', (fresh) => {
	let list!: Component<{ items: { id: string; label: string }[] }>;
	const children: Component<{}>[] = [];
	const cleanup: string[] = [];
	const scopes: string[] = [];
	const releasedScopes: string[] = [];
	function Row(this: Component<{}>, props: { item: { id: string; label: string } }) {
		children.push(this);
		this.onUnmount(() => cleanup.push(props.item.id));
		return () => jsx('li', { children: createExpression(() => props.item.label) });
	}
	function List(this: Component<{ items: { id: string; label: string }[] }>) {
		list = this;
		this.state.items = [{ id: 'a', label: 'A' }];
		return () =>
			jsx('ul', {
				children: this.map(
					this.state.items,
					(item) => item.id,
					(item) => {
						scopes.push(item.id);
						registerEffectScopeCleanup(currentEffectScope()!, () => releasedScopes.push(item.id));
						return jsx(Row, { item });
					}
				)
			});
	}
	const container = document.createElement('div');
	renderTestTree(jsx(List, {}), container);
	try {
		const node = container.querySelector('li');
		const child = children[0];
		const old = list.state.items[0]!;
		list.state.items = fresh ? [{ id: 'a', label: 'B' }] : [old];
		if (!fresh) old.label = 'B';
		flushSync();
		expect(container.textContent).toBe('B');
		if (fresh) expect(old.label).toBe('A');
		expect(container.querySelector('li')).toBe(node);
		expect(children).toEqual([child]);
		expect(cleanup).toEqual([]);
		expect(scopes).toHaveLength(fresh ? 2 : 1);
		expect(releasedScopes).toHaveLength(fresh ? 1 : 0);
		list.state.items[0]!.label = 'C';
		flushSync();
		expect(container.textContent).toBe('C');
		list.state.items = [];
		flushSync();
		expect(cleanup).toEqual(['a']);
		expect(releasedScopes).toHaveLength(scopes.length);
		expect(container.textContent).toBe('');
	} finally {
		unmount(container);
	}
});
