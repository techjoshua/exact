/**
 * @vitest-environment jsdom
 */
import { render, unmount } from '@exactjs/dom';
import { createEnhancementMarker } from '@exactjs/core';
import { PhysicsElement, PhysicsWorld, createPhysicsWorld } from '@exactjs/physics';
import { createTestVNode as createVNode } from '@exactjs/testing/internal/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GravityElement } from './components.js';
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
});
