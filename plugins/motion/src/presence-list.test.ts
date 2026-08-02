/**
 * @vitest-environment jsdom
 */
import { createExpression, createRef, type Component } from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import {
	createTestVNode as createVNode,
	createCompiledTestVNode,
	markTestComponent
} from '@exactjs/testing/internal/fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMotionDriver } from './driver.js';
import { MotionList } from './motion-list.js';
import { Motion } from './motion.js';
import { Presence } from './presence.js';
import { fade } from './presets.js';
import { createMotionTestDriver } from './testing.js';

const containers: Element[] = [];

afterEach(() => {
	for (const container of containers.splice(0)) {
		unmount(container);
		container.remove();
	}
});

describe('Presence and MotionList', () => {
	it('makes a leaving target inert, returns focus, and reverses the same DOM generation', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		const opener = createRef<HTMLButtonElement>('opener');
		let owner!: Component<{ shown: boolean }>;
		const View = markTestComponent(function View(this: Component<{ shown: boolean }>) {
			owner = this;
			this.state.shown = true;
			return () =>
				createVNode(
					'section',
					null,
					createVNode('button', { ref: this.ref(opener) }, 'Open'),
					createVNode(
						Presence,
						{ when: this.state.shown, returnFocus: this.ref(opener) },
						createVNode(Motion, {
							as: 'button',
							motion: fade,
							children: 'Close'
						})
					)
				);
		});
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		try {
			render(createVNode(View, null), container);
			const target = [...container.querySelectorAll('button')][1]!;
			target.focus();

			owner.state.shown = false;
			flushSync();
			await settle();
			expect(target.inert).toBe(true);
			expect(target.style.pointerEvents).toBe('none');
			expect(document.activeElement).toBe(container.querySelector('button'));
			expect(driver.playbacks).toHaveLength(1);

			owner.state.shown = true;
			flushSync();
			await settle();
			expect([...container.querySelectorAll('button')][1]).toBe(target);
			expect(target.inert).toBe(false);
			expect(target.style.pointerEvents).toBe('');
			expect(driver.playbacks[0]?.signal.aborted).toBe(true);
		} finally {
			restore();
		}
	});

	it('preserves keyed DOM identity across reorder and rejects duplicate keys', () => {
		let owner!: Component<{ items: Array<{ id: string }> }>;
		const List = markTestComponent(function List(
			this: Component<{ items: Array<{ id: string }> }>
		) {
			owner = this;
			this.state.items = [{ id: 'a' }, { id: 'b' }];
			return () =>
				createCompiledTestVNode(MotionList, {
					items: createExpression(() => this.state.items),
					getKey: (item: { id: string }) => item.id,
					children: (item: { id: string }) => createVNode('li', null, item.id)
				});
		});
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		render(createVNode(List, null), container);
		const first = container.querySelector('li');

		owner.state.items.reverse();
		flushSync();
		expect([...container.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
			'b',
			'a'
		]);
		expect(container.querySelectorAll('li')[1]).toBe(first);

		expect(() => owner.state.items.splice(0, 2, { id: 'a' }, { id: 'a' })).toThrow(
			'Duplicate key "a" in this.map()'
		);
	});
});

async function settle(): Promise<void> {
	for (let index = 0; index < 8; index++) await Promise.resolve();
}
