/**
 * @vitest-environment jsdom
 */
import { createEnhancementMarker } from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import { createTestVNode as createVNode } from '@exactjs/testing/internal/fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMotionDriver } from './driver.js';
import { MotionElement } from './motion-element.js';
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
});

async function settle(): Promise<void> {
	for (let index = 0; index < 8; index++) await Promise.resolve();
}
