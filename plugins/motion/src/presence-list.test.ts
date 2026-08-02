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
import { MotionConfig } from './context.js';
import { LayoutGroup } from './layout.js';
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
	it('waits for keyed exits before mounting an out-in replacement', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		let owner!: Component<{ key: string }>;
		const View = markTestComponent(function View(this: Component<{ key: string }>) {
			owner = this;
			this.state.key = 'a';
			return () =>
				createVNode(
					Presence,
					{ when: true, mode: 'out-in' },
					createVNode(Motion, {
						key: this.state.key,
						as: 'button',
						motion: fade,
						children: this.state.key
					})
				);
		});
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		try {
			render(createVNode(View, null), container);
			const first = container.querySelector('button')!;

			owner.state.key = 'b';
			flushSync();
			await settle();

			expect(container.textContent).toBe('a');
			expect(container.querySelector('button')).toBe(first);
			expect(driver.playbacks).toHaveLength(1);

			driver.finishAll();
			await vi.waitFor(() => {
				flushSync();
				expect(container.textContent).toBe('b');
			});
			expect(container.querySelector('button')).not.toBe(first);
			expect(driver.playbacks).toHaveLength(2);
			expect(driver.playbacks[1]?.element.textContent).toBe('b');
		} finally {
			restore();
		}
	});

	it('mounts an in-out replacement before releasing the previous keyed range', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		let owner!: Component<{ key: string }>;
		const View = markTestComponent(function View(this: Component<{ key: string }>) {
			owner = this;
			this.state.key = 'a';
			return () =>
				createVNode(
					Presence,
					{ when: true, mode: 'in-out' },
					createVNode(Motion, {
						key: this.state.key,
						as: 'button',
						motion: fade,
						children: this.state.key
					})
				);
		});
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		try {
			render(createVNode(View, null), container);
			const first = container.querySelector('button')!;

			owner.state.key = 'b';
			flushSync();
			const current = [...container.querySelectorAll('button')];
			expect(current.map((item) => item.textContent)).toEqual(['b', 'a']);
			const replacement = current[0]!;

			await settle();
			flushSync();

			expect(driver.playbacks).toHaveLength(1);
			expect(driver.playbacks[0]?.element).toBe(replacement);
			expect(first.inert).not.toBe(true);

			driver.playbacks[0]?.finish();
			await vi.waitFor(() => {
				flushSync();
				expect(driver.playbacks).toHaveLength(2);
			});
			expect(driver.playbacks[1]?.element).toBe(first);
			expect(first.inert).toBe(true);
		} finally {
			restore();
		}
	});

	it('advances in-out replacement immediately when reduced motion skips enter', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		let owner!: Component<{ key: string }>;
		const View = markTestComponent(function View(this: Component<{ key: string }>) {
			owner = this;
			this.state.key = 'a';
			return () =>
				createVNode(
					MotionConfig,
					{ reducedMotion: 'always' },
					createVNode(
						Presence,
						{ when: true, mode: 'in-out' },
						createVNode(Motion, {
							key: this.state.key,
							as: 'button',
							motion: fade,
							children: this.state.key
						})
					)
				);
		});
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		try {
			render(createVNode(View, null), container);
			owner.state.key = 'b';
			flushSync();
			await vi.waitFor(() => {
				flushSync();
				expect(container.textContent).toBe('b');
			});
			expect(driver.playbacks).toHaveLength(0);
		} finally {
			restore();
		}
	});

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
			expect(driver.playbacks).toHaveLength(1);
			expect(driver.playbacks[0]?.element).toBe(target);
			expect(driver.playbacks[0]?.signal.aborted).toBe(false);
			expect(target.isConnected).toBe(true);
			expect(target.inert).toBe(true);
			expect(target.style.pointerEvents).toBe('none');
			expect(document.activeElement).toBe(container.querySelector('button'));

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

		const Duplicate = markTestComponent(function Duplicate(this: Component<{}>) {
			const items = [{ id: 'a' }, { id: 'a' }];
			return () =>
				createVNode(MotionList, {
					items,
					getKey: (item: { id: string }) => item.id,
					children: (item: { id: string }) => createVNode('li', null, item.id)
				});
		});
		const duplicateContainer = document.createElement('div');
		document.body.append(duplicateContainer);
		containers.push(duplicateContainer);
		render(createVNode(Duplicate, null), duplicateContainer);
		expect(duplicateContainer.textContent).toContain('Duplicate key "a" in this.map()');
	});

	it('measures keyed reorders inside a LayoutGroup and plays additive FLIP motion', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		let owner!: Component<{ items: Array<{ id: string }> }>;
		const List = markTestComponent(function List(
			this: Component<{ items: Array<{ id: string }> }>
		) {
			owner = this;
			this.state.items = [{ id: 'a' }, { id: 'b' }];
			return () =>
				createVNode(
					LayoutGroup,
					{ id: 'cards' },
					createCompiledTestVNode(MotionList, {
						items: createExpression(() => this.state.items),
						getKey: (item: { id: string }) => item.id,
						children: (item: { id: string }) =>
							createVNode(Motion, {
								as: 'li',
								layout: 'position',
								layoutId: item.id,
								children: item.id
							})
					})
				);
		});
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		try {
			render(createVNode(List, null), container);
			const elements = [...container.querySelectorAll('li')];
			for (const element of elements) {
				vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
					const top = [...container.querySelectorAll('li')].indexOf(element) * 40;
					return rect(top);
				});
			}

			owner.state.items.reverse();
			flushSync();
			await settle();

			expect(driver.playbacks).toHaveLength(2);
			expect(driver.playbacks.map((playback) => playback.element.textContent).sort()).toEqual([
				'a',
				'b'
			]);
			for (const playback of driver.playbacks) {
				const first = (playback.effect.keyframes as Keyframe[])[0]!;
				expect(first.composite).toBe('add');
				expect(first.transform).toMatch(/translate\(0px, (-40|40)px\)/);
			}
		} finally {
			restore();
		}
	});

	it('pops a leaving list item out of layout and restores it on reinsertion', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		let owner!: Component<{ items: Array<{ id: string }> }>;
		const List = markTestComponent(function List(
			this: Component<{ items: Array<{ id: string }> }>
		) {
			owner = this;
			this.state.items = [{ id: 'a' }];
			return () =>
				createCompiledTestVNode(MotionList, {
					items: createExpression(() => this.state.items),
					getKey: (item: { id: string }) => item.id,
					exitLayout: 'pop',
					children: (item: { id: string }) =>
						createVNode(Motion, {
							as: 'li',
							motion: fade,
							children: item.id
						})
				});
		});
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		try {
			render(createVNode(List, null), container);
			const target = container.querySelector('li')!;
			vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(24));

			owner.state.items.splice(0, 1);
			flushSync();
			await settle();
			expect(driver.playbacks).toHaveLength(1);
			expect(driver.playbacks[0]?.element).toBe(target);
			expect(driver.playbacks[0]?.signal.aborted).toBe(false);
			expect(target.isConnected).toBe(true);
			expect(target.inert).toBe(true);
			expect(target.style.position).toBe('fixed');
			expect(target.style.top).toBe('24px');

			owner.state.items.push({ id: 'a' });
			flushSync();
			await settle();
			expect(container.querySelector('li')).toBe(target);
			expect(target.style.position).toBe('');
			expect(target.style.top).toBe('');
			expect(driver.playbacks[0]?.signal.aborted).toBe(true);
		} finally {
			restore();
		}
	});
});

async function settle(): Promise<void> {
	for (let index = 0; index < 8; index++) await Promise.resolve();
}

function rect(top: number): DOMRect {
	return {
		x: 0,
		y: top,
		top,
		left: 0,
		right: 100,
		bottom: top + 20,
		width: 100,
		height: 20,
		toJSON: () => ({})
	};
}
