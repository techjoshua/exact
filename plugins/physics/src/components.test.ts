/**
 * @vitest-environment jsdom
 */
import { render, unmount } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import { createTestVNode as createVNode } from '@exactjs/testing/internal/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhysicsElement, PhysicsWorldComponent } from './components.js';
import { createPhysicsWorld } from './world.js';

const containers: Element[] = [];

beforeEach(() => {
	vi.stubGlobal('requestAnimationFrame', () => 1);
	vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
	for (const container of containers.splice(0)) unmount(container);
	vi.unstubAllGlobals();
});

describe('physics components', () => {
	it('projects coalesced body snapshots through the resolved logical root', () => {
		const world = createPhysicsWorld({ fixedStep: 0.1 });
		const body = world.createBody({
			position: { x: 2, y: 3 },
			shape: { kind: 'circle', radius: 1 }
		});
		const container = document.createElement('div');
		containers.push(container);
		render(
			createVNode(
				PhysicsWorldComponent,
				{ world, running: false },
				createVNode(PhysicsElement, { body }, createVNode('div', null))
			),
			container
		);
		const target = container.querySelector('div')!;
		expect(target.style.translate).toBe('2px 3px');

		body.setPose({ position: { x: 8, y: 13 } });
		world.step(0.1);
		flushSync();
		expect(target.style.translate).toBe('8px 13px');
	});
});
