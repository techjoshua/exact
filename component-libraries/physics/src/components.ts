import {
	createTaskOwner,
	defineTask,
	markExactEnhancementContexts,
	taskAnimationFrame,
	unwrap,
	watch,
	type Component
} from '@exactjs/core';
import { markExactComponent } from '@exactjs/core/framework/component-contracts';
import { PhysicsBodyContext, PhysicsWorldContext } from './context.js';
import type {
	PhysicsElementProps,
	PhysicsWorld as PhysicsWorldResource,
	PhysicsWorldProps
} from './contracts.js';
import { BodyProjectionController } from './projection-controller.js';
import { positionAndRotation } from './projections.js';
import { createPhysicsWorld } from './world.js';

/** Context-producing component that owns one Activity-aware physics frame loop. */
export const PhysicsWorldComponent = markExactComponent(function PhysicsWorld(
	this: Component<{}>,
	props: PhysicsWorldProps
) {
	const supplied = unwrap(props.world);
	const world = supplied ?? createPhysicsWorld(unwrap(props.options));
	this.setContext(PhysicsWorldContext, world);

	this.onActivate(({ signal }) => {
		const owner = createTaskOwner({ label: 'physics:world' });
		const step = defineTask<[number], void>(
			{
				label: 'physics:step',
				placement: 'client',
				priority: 'immediate',
				concurrency: 'latest',
				readiness: 'nonblocking',
				detached: true,
				owner
			},
			(elapsedSeconds) => {
				world.step(elapsedSeconds);
			}
		);
		signal.addEventListener('abort', () => void owner[Symbol.asyncDispose](), { once: true });
		let previousTime: number | undefined;
		const tick = (time: number) => {
			if (signal.aborted) return;
			if (props.running ?? true) {
				world.start();
				if (previousTime !== undefined) void step(Math.max(0, (time - previousTime) / 1000));
			} else {
				world.pause();
			}
			previousTime = time;
			taskAnimationFrame(signal, tick);
		};
		taskAnimationFrame(signal, tick);
	});
	this.onDeactivate(() => world.pause());
	this.onUnmount(() => {
		world.pause();
		if (!supplied) world[Symbol.dispose]();
	});
	return () => props.children;
}, '@exactjs/physics:PhysicsWorld');

/** Transparent ordinary component activated for one resolved physics target. */
export const PhysicsElement = markExactComponent(function PhysicsElement(
	this: Component<{}>,
	props: PhysicsElementProps
) {
	const root = this.refs.root<HTMLElement | SVGElement>();
	if (!this.hasContext(PhysicsWorldContext)) {
		throw new Error('PhysicsElement requires a PhysicsWorld context');
	}
	const world = this.getContext(PhysicsWorldContext) as PhysicsWorldResource;
	this.setContext(PhysicsBodyContext, {
		get body() {
			return unwrap(props.body);
		},
		world
	});
	const controller = new BodyProjectionController(world, (message, data) =>
		this.log.warn(message, data)
	);

	watch(() => {
		const body = unwrap(props.body);
		const projection = unwrap(props.project) ?? positionAndRotation;
		// These reads subscribe one coalesced projection pass to the reactive pose snapshot.
		void body.pose.position.x;
		void body.pose.position.y;
		void body.pose.angle;
		controller.configure({
			body,
			element: root.current,
			presented: root.presented,
			disabled: props.disabled ?? false,
			projection,
			collisions: unwrap(props.collisions)
		});
	});

	this.onDeactivate(() =>
		controller.configure({
			body: unwrap(props.body),
			element: root.current,
			presented: false,
			disabled: true,
			projection: unwrap(props.project) ?? positionAndRotation,
			collisions: unwrap(props.collisions)
		})
	);
	this.onUnmount(() => controller[Symbol.dispose]());
	return () => props.children;
}, '@exactjs/physics:PhysicsElement');

markExactEnhancementContexts(PhysicsElement, { provides: [PhysicsBodyContext] });
