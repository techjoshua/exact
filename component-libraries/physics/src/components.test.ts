/**
 * @vitest-environment jsdom
 */
import { Activity, type Component } from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import '@exactjs/dom/structural-boundaries';
import { computed, flushSync } from '@exactjs/reactive';
import {
	createTestVNode as createVNode,
	markTestComponent
} from '@exactjs/testing/internal/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhysicsElement, PhysicsWorldComponent } from './components.js';
import { PhysicsBodyContext } from './context.js';
import type { PhysicsBody, PhysicsWorld } from './contracts.js';
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

	it('rebinds a replaced body without replacing the component target', () => {
		const world = createPhysicsWorld({ fixedStep: 0.1 });
		const first = world.createBody({
			position: { x: 2, y: 3 },
			shape: { kind: 'circle', radius: 1 }
		});
		const second = world.createBody({
			position: { x: 10, y: 12 },
			shape: { kind: 'circle', radius: 1 }
		});
		let owner!: Component<{ body: PhysicsBody }>;
		const Scene = markTestComponent(function Scene(this: Component<{ body: PhysicsBody }>) {
			owner = this;
			this.state.body = first;
			return () =>
				createVNode(
					PhysicsWorldComponent,
					{ world, running: false },
					createVNode(PhysicsElement, { body: this.state.body }, createVNode('div', null))
				);
		});
		const container = document.createElement('div');
		containers.push(container);
		render(createVNode(Scene, null), container);
		const target = container.querySelector('div')!;

		owner.state.body = second;
		flushSync();
		expect(container.querySelector('div')).toBe(target);
		expect(target.style.translate).toBe('10px 12px');

		first.setPose({ position: { x: 40, y: 50 } });
		world.step(0.1);
		flushSync();
		expect(target.style.translate).toBe('10px 12px');

		second.setPose({ position: { x: 14, y: 16 } });
		world.step(0.1);
		flushSync();
		expect(target.style.translate).toBe('14px 16px');
	});

	it('pauses and replaces its owned frame loop across Activity deactivation', () => {
		const frames: FrameRequestCallback[] = [];
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});
		const world = createPhysicsWorld({ fixedStep: 0.1 });
		const container = document.createElement('div');
		containers.push(container);
		const tree = (mode: 'active' | 'parked') =>
			createVNode(
				Activity,
				{ mode },
				createVNode(PhysicsWorldComponent, { world }, createVNode('div', null))
			);

		render(tree('active'), container);
		frames.shift()?.(0);
		expect(world.running).toBe(true);
		const activeFrame = frames.shift()!;

		render(tree('parked'), container);
		expect(world.running).toBe(false);
		activeFrame(16);
		expect(world.running).toBe(false);

		render(tree('active'), container);
		const resumedFrame = frames.shift();
		expect(resumedFrame).toBeDefined();
		resumedFrame?.(32);
		expect(world.running).toBe(true);
	});

	it('unwraps compiler-reactive resource props before invoking them', () => {
		const frames: FrameRequestCallback[] = [];
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});
		const world = createPhysicsWorld({ fixedStep: 0.1 });
		const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
		let contextualBody: PhysicsBody | undefined;
		const Consumer = markTestComponent(function Consumer(this: Component<{}>) {
			contextualBody = this.getContext(PhysicsBodyContext).body;
			return () => createVNode('div', null);
		});
		const container = document.createElement('div');
		containers.push(container);
		render(
			createVNode(
				PhysicsWorldComponent,
				{ world: computed(() => world) as unknown as PhysicsWorld },
				createVNode(
					PhysicsElement,
					{ body: computed(() => body) as unknown as PhysicsBody },
					createVNode(Consumer, null)
				)
			),
			container
		);

		frames.shift()?.(0);
		expect(world.running).toBe(true);
		expect(contextualBody).toBe(body);
	});
});
