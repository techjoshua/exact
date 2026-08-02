// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { BodyProjectionController } from './projection-controller.js';
import { positionAndRotation, positionOnly } from './projections.js';
import { createPhysicsWorld } from './world.js';

describe('body projection controller', () => {
	it('projects independent transform channels and restores only owned values', () => {
		const world = createPhysicsWorld({ fixedStep: 0.1 });
		const body = world.createBody({
			position: { x: 2, y: 3 },
			angle: 0.5,
			shape: { kind: 'circle', radius: 1 }
		});
		const element = document.createElement('div');
		const controller = new BodyProjectionController(world);
		controller.configure({ body, element, presented: true, disabled: false, projection: positionAndRotation });
		expect(element.style.translate).toBe('2px 3px');
		expect(element.style.rotate).toBe('0.5rad');
		controller[Symbol.dispose]();
		expect(element.style.translate).toBe('');
		expect(element.style.rotate).toBe('');
	});

	it('diagnoses and preserves an authored channel', () => {
		const world = createPhysicsWorld();
		const body = world.createBody({ shape: { kind: 'circle', radius: 1 } });
		const element = document.createElement('div');
		element.style.translate = '10px';
		const warn = vi.fn();
		const controller = new BodyProjectionController(world, warn);
		controller.configure({ body, element, presented: true, disabled: false, projection: positionOnly });
		expect(element.style.translate).toBe('10px');
		expect(warn).toHaveBeenCalledOnce();
	});

	it('filters collision batches to the configured body and rebinds atomically', () => {
		const world = createPhysicsWorld({ fixedStep: 0.1 });
		const first = world.createBody({ type: 'static', shape: { kind: 'circle', radius: 2 } });
		const second = world.createBody({ position: { x: 3, y: 0 }, shape: { kind: 'circle', radius: 2 } });
		const listener = vi.fn();
		const controller = new BodyProjectionController(world);
		controller.configure({
			body: second,
			presented: false,
			disabled: false,
			projection: positionOnly,
			collisions: listener
		});
		world.step(0.1);
		expect(listener).toHaveBeenCalledOnce();
		first[Symbol.dispose]();
		world.step(0.1);
		expect(listener).toHaveBeenCalledOnce();
	});
});
