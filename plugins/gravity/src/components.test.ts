/**
 * @vitest-environment jsdom
 */
import { render, unmount } from '@exactjs/dom';
import { Activity, createEnhancementMarker, type Component } from '@exactjs/core';
import { PhysicsElement, PhysicsWorld, createPhysicsWorld } from '@exactjs/physics';
import { flushSync } from '@exactjs/reactive';
import {
	createTestVNode as createVNode,
	markTestComponent
} from '@exactjs/testing/internal/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GravityElement, GravityFieldComponent } from './components.js';
import type { GravityField } from './contracts.js';
import { uniformGravity } from './fields.js';

const containers: Element[] = [];

beforeEach(() => {
	vi.stubGlobal('requestAnimationFrame', () => 1);
	vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
	for (const container of containers.splice(0)) unmount(container);
	vi.unstubAllGlobals();
});

describe('GravityElement', () => {
	it('consumes same-target physics context and disposes its contribution', () => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
		const container = document.createElement('div');
		containers.push(container);
		render(
			createVNode(
				PhysicsWorld,
				{ world, running: false },
				createVNode(
					PhysicsElement,
					{ body },
					createVNode(
						GravityElement,
						{ apply: uniformGravity({ x: 0, y: 4 }) },
						createVNode('div', null)
					)
				)
			),
			container
		);
		world.step(1);
		expect(body.velocity.y).toBe(4);
		unmount(container);
		containers.length = 0;
		world.step(1);
		expect(body.velocity.y).toBe(4);
	});

	it('remains transparent without a physics body', () => {
		const container = document.createElement('div');
		containers.push(container);
		render(
			createVNode(
				GravityElement,
				{ apply: uniformGravity({ x: 0, y: 1 }) },
				createVNode('span', null, 'safe')
			),
			container
		);
		expect(container.textContent).toBe('safe');
	});

	it('orders same-target gravity inside physics independently of marker order', () => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
		const container = document.createElement('div');
		containers.push(container);
		const physicsIdentity = '@exactjs/physics#default';
		const gravityIdentity = '@exactjs/gravity#default';
		render(
			createVNode(
				PhysicsWorld,
				{ world, running: false },
				createVNode('div', {
					__exactEnhancements: createEnhancementMarker([
						{ identity: gravityIdentity, props: { apply: uniformGravity({ x: 0, y: 6 }) } },
						{ identity: physicsIdentity, props: { body } }
					])
				})
			),
			container,
			{
				enhancementCatalog: new Map([
					[gravityIdentity, GravityElement],
					[physicsIdentity, PhysicsElement]
				])
			}
		);
		world.step(1);
		expect(body.velocity.y).toBe(6);
	});

	it('keeps element force work disabled while Activity is parked', () => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
		const weak = uniformGravity({ x: 0, y: 2 });
		let owner!: Component<{ field: GravityField; mode: 'active' | 'parked' }>;
		const Scene = markTestComponent(function Scene(
			this: Component<{ field: GravityField; mode: 'active' | 'parked' }>
		) {
			owner = this;
			this.state.field = weak;
			this.state.mode = 'active';
			return () =>
				createVNode(
					Activity,
					{ mode: this.state.mode },
					createVNode(
						PhysicsWorld,
						{ world, running: false },
						createVNode(
							PhysicsElement,
							{ body },
							createVNode(GravityElement, { apply: this.state.field }, createVNode('div', null))
						)
					)
				);
		});
		const container = document.createElement('div');
		containers.push(container);
		render(createVNode(Scene, null), container);
		world.step(1);
		expect(body.velocity.y).toBe(2);

		owner.state.mode = 'parked';
		flushSync();
		world.step(1);
		expect(body.velocity.y).toBe(2);

		owner.state.mode = 'active';
		flushSync();
		world.step(1);
		expect(body.velocity.y).toBe(4);
	});

	it('keeps subtree force work disabled while Activity is parked', () => {
		const world = createPhysicsWorld({ fixedStep: 1, sleep: false });
		const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
		const field = uniformGravity({ x: 0, y: 3 });
		const container = document.createElement('div');
		containers.push(container);
		const tree = (mode: 'active' | 'parked') =>
			createVNode(
				PhysicsWorld,
				{ world, running: false },
				createVNode(
					Activity,
					{ mode },
					createVNode(GravityFieldComponent, { field }, createVNode('div', null))
				)
			);

		render(tree('active'), container);
		world.step(1);
		expect(body.velocity.y).toBe(3);
		render(tree('parked'), container);
		world.step(1);
		expect(body.velocity.y).toBe(3);
		render(tree('active'), container);
		world.step(1);
		expect(body.velocity.y).toBe(6);
	});
});
