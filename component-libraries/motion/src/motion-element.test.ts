/**
 * @vitest-environment jsdom
 */
import { Activity, createEnhancementMarker, createExpression, type Component } from '@exactjs/core';
import { runTaskFrame } from '@exactjs/core/framework/task-frames';
import { render, unmount } from '@exactjs/dom/enhanced';
import { flushSync } from '@exactjs/reactive';
import {
	createTestVNode as createVNode,
	markTestComponent
} from '@exactjs/testing/internal/fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMotionDriver } from './driver.js';
import { defineMotion } from './definitions.js';
import { MotionElement } from './motion-element.js';
import { Motion } from './motion.js';
import { fade } from './presets.js';
import { createMotionTestDriver } from './testing.js';

const identity = '@exactjs/motion#default';
const containers: Element[] = [];

afterEach(() => {
	for (const container of containers.splice(0)) unmount(container);
});

describe('MotionElement', () => {
	it('attaches finite leave playback to renderer root release settlement', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		const container = document.createElement('div');
		containers.push(container);
		const marker = createEnhancementMarker([{ identity, props: { apply: fade, appear: false } }]);
		try {
			render(createVNode('button', { __exactEnhancements: marker }, 'Save'), container, {
				enhancementCatalog: new Map([[identity, MotionElement]])
			});
			expect(driver.playbacks).toHaveLength(0);

			render(createVNode('span', null, 'Next'), container, {
				enhancementCatalog: new Map([[identity, MotionElement]])
			});
			await settle();
			expect(driver.playbacks).toHaveLength(1);
			expect(container.querySelector('button')?.inert).toBe(true);
			expect(container.innerHTML).toContain('<button');

			driver.finishAll();
			await vi.waitFor(() => expect(container.innerHTML).toBe('<span>Next</span>'));
		} finally {
			restore();
		}
	});

	it('plays enter only when appear policy permits it', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		const container = document.createElement('div');
		containers.push(container);
		try {
			render(
				createVNode('button', {
					__exactEnhancements: createEnhancementMarker([
						{ identity, props: { apply: fade, appear: true } }
					])
				}),
				container,
				{ enhancementCatalog: new Map([[identity, MotionElement]]) }
			);
			await settle();
			expect(driver.playbacks).toHaveLength(1);
			expect(driver.playbacks[0]?.effect.keyframes).toEqual(
				(fade.enter as { keyframes: Keyframe[] }).keyframes
			);
		} finally {
			restore();
		}
	});

	it('plays enter for a root introduced by a later reactive update', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		let owner!: Component<{ shown: boolean }>;
		const Scene = markTestComponent(function Scene(this: Component<{ shown: boolean }>) {
			owner = this;
			this.state.shown = false;
			return () =>
				this.state.shown
					? createVNode(Motion, { as: 'button', motion: fade, children: 'Later' })
					: null;
		});
		const container = document.createElement('div');
		containers.push(container);
		try {
			render(createVNode(Scene, null), container);
			expect(driver.playbacks).toHaveLength(0);

			owner.state.shown = true;
			flushSync();
			await settle();

			expect(container.textContent).toBe('Later');
			expect(driver.playbacks).toHaveLength(1);
			expect(driver.playbacks[0]?.element).toBe(container.querySelector('button'));
			expect(driver.playbacks[0]?.effect.keyframes).toEqual(
				(fade.enter as { keyframes: Keyframe[] }).keyframes
			);
		} finally {
			restore();
		}
	});

	it('observes a change-only phase after the initial enter path is skipped', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		let owner!: Component<{ offset: number }>;
		const Scene = markTestComponent(function Scene(this: Component<{ offset: number }>) {
			owner = this;
			this.state.offset = 0;
			const marker = createEnhancementMarker([
				{
					identity,
					props: {
						change: createExpression(() => ({
							keyframes: [
								{ transform: 'translateX(0)' },
								{ transform: `translateX(${this.state.offset}px)` }
							]
						}))
					}
				}
			]);
			return () => createVNode('span', { __exactEnhancements: marker }, 'Indicator');
		});
		const container = document.createElement('div');
		containers.push(container);
		try {
			render(createVNode(Scene, null), container, {
				enhancementCatalog: new Map([[identity, MotionElement]])
			});
			expect(driver.playbacks).toHaveLength(0);

			owner.state.offset = 48;
			flushSync();
			await settle();

			expect(driver.playbacks).toHaveLength(1);
			expect(driver.playbacks[0]?.effect.keyframes).toEqual([
				{ transform: 'translateX(0)' },
				{ transform: 'translateX(48px)' }
			]);
		} finally {
			restore();
		}
	});

	it('cancels active visual work before starting leave', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		const container = document.createElement('div');
		containers.push(container);
		try {
			render(
				createVNode(Motion, { as: 'button', motion: fade, appear: true, children: 'Leaving' }),
				container
			);
			await settle();
			expect(driver.playbacks).toHaveLength(1);
			expect(driver.playbacks[0]?.signal.aborted).toBe(false);

			render(createVNode('span', null, 'Next'), container);
			await settle();
			expect(driver.playbacks).toHaveLength(2);
			expect(driver.playbacks[0]?.signal.aborted).toBe(true);
			expect(driver.playbacks[1]?.element.textContent).toBe('Leaving');
		} finally {
			restore();
		}
	});

	it('cancels active visual work when Activity parks the owner', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		const container = document.createElement('div');
		containers.push(container);
		const tree = (mode: 'active' | 'parked') =>
			createVNode(
				Activity,
				{ mode },
				createVNode(Motion, { as: 'button', motion: fade, appear: true, children: 'Parked' })
			);
		try {
			render(tree('active'), container);
			await settle();
			expect(driver.playbacks).toHaveLength(1);

			render(tree('parked'), container);
			await settle();
			expect(driver.playbacks[0]?.signal.aborted).toBe(true);
			expect(driver.playbacks).toHaveLength(1);
		} finally {
			restore();
		}
	});

	it('detaches looping enter work from its causal task and cancels it on removal', async () => {
		const driver = createMotionTestDriver();
		const restore = installMotionDriver(driver);
		const loop = defineMotion({
			enter: {
				keyframes: [{ opacity: 0.5 }, { opacity: 1 }],
				options: { duration: 100, iterations: Infinity }
			}
		});
		const container = document.createElement('div');
		containers.push(container);
		let causalSettled = false;
		try {
			const causal = runTaskFrame(
				{ kind: 'test-motion-cause' },
				{
					work() {
						render(
							createVNode(Motion, { as: 'div', motion: loop, appear: true, children: 'Loop' }),
							container
						);
					}
				}
			);
			void causal.then(() => {
				causalSettled = true;
			});
			await vi.waitFor(() => expect(causalSettled).toBe(true));
			expect(driver.playbacks).toHaveLength(1);
			expect(driver.playbacks[0]?.signal.aborted).toBe(false);

			render(createVNode('span', null, 'Done'), container);
			await vi.waitFor(() => expect(container.textContent).toBe('Done'));
			expect(driver.playbacks[0]?.signal.aborted).toBe(true);
		} finally {
			restore();
		}
	});
});

async function settle(): Promise<void> {
	for (let index = 0; index < 8; index++) await Promise.resolve();
}
