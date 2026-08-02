import { markExactComponent, unwrap, watch, type Component } from '@exactjs/core';
import { PhysicsBodyContext, PhysicsWorldContext, type PhysicsWorld } from '@exactjs/physics';
import { applyGravity } from './application.js';
import type { GravityApplication, GravityElementProps, GravityFieldProps } from './contracts.js';
import { BodyGravityRegistration } from './registration.js';

/** Transparent subtree component that owns one world field registration. */
export const GravityFieldComponent = markExactComponent(function GravityField(
	this: Component<{}>,
	props: GravityFieldProps
) {
	if (!this.hasContext(PhysicsWorldContext)) {
		throw new Error('GravityField requires a PhysicsWorld context');
	}
	const world = this.getContext(PhysicsWorldContext) as PhysicsWorld;
	let application: GravityApplication | undefined;
	const configure = () => {
		application?.[Symbol.dispose]();
		application = applyGravity(world, unwrap(props.field), {
			name: props.name,
			order: props.order,
			scale: props.scale,
			enabled: props.enabled,
			groups: props.groups,
			collisionLayers: props.collisionLayers,
			bodies: props.bodies,
			predicate: props.predicate
		});
	};
	watch(configure);
	this.onActivate(configure);
	this.onDeactivate(() => {
		application?.[Symbol.dispose]();
		application = undefined;
	});
	this.onUnmount(() => application?.[Symbol.dispose]());
	return () => props.children;
}, '@exactjs/gravity:GravityField');

/** Transparent same-target component that consumes the current physics body. */
export const GravityElement = markExactComponent(function GravityElement(
	this: Component<{}>,
	props: GravityElementProps
) {
	if (!this.hasContext(PhysicsBodyContext)) {
		this.log.error('Gravity enhancement requires a physics body', undefined, {
			enhancement: '@exactjs/gravity#default',
			missingContext: 'PhysicsBodyContext'
		});
		return () => props.children;
	}
	const physics = this.getContext(PhysicsBodyContext);
	const registration = new BodyGravityRegistration();
	const configure = () =>
		registration.configure({
			world: physics.world,
			body: physics.body,
			field: unwrap(props.apply),
			scale: props.scale ?? 1,
			disabled: props.disabled ?? false,
			attractor: unwrap(props.attractor)
		});
	watch(configure);
	this.onActivate(configure);
	this.onDeactivate(() =>
		registration.configure({
			world: physics.world,
			body: physics.body,
			scale: 1,
			disabled: true
		})
	);
	this.onUnmount(() => registration[Symbol.dispose]());
	return () => props.children;
}, '@exactjs/gravity:GravityElement');
