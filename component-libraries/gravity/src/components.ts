import { unwrap, watch, type ComponentInstance } from '@exactjs/core';
import { PhysicsBodyContext, PhysicsWorldContext, type PhysicsWorld } from '@exactjs/physics';
import { applyGravity } from './application.js';
import type {
	BodyGravityConfiguration,
	GravityApplication,
	GravityApplicationOptions,
	GravityElementProps,
	GravityField,
	GravityFieldProps
} from './contracts.js';
import { BodyGravityRegistration } from './registration.js';

/** Transparent subtree component that owns one world field registration. */
export function GravityFieldComponent(this: ComponentInstance<{}>, props: GravityFieldProps) {
	if (!this.hasContext(PhysicsWorldContext)) {
		throw new Error('GravityField requires a PhysicsWorld context');
	}
	const world = this.getContext(PhysicsWorldContext) as PhysicsWorld;
	let application: GravityApplication | undefined;
	let active = false;
	let field!: GravityField;
	let options: GravityApplicationOptions = {};
	const install = () => {
		application?.[Symbol.dispose]();
		application = applyGravity(world, field, options);
	};
	watch(() => {
		field = unwrap(props.field);
		options = {
			name: props.name,
			order: props.order,
			scale: props.scale,
			enabled: props.enabled,
			groups: props.groups,
			collisionLayers: props.collisionLayers,
			bodies: props.bodies,
			predicate: props.predicate
		};
		if (active) install();
	});
	this.onActivate(() => {
		active = true;
		install();
	});
	this.onDeactivate(() => {
		active = false;
		application?.[Symbol.dispose]();
		application = undefined;
	});
	this.onUnmount(() => application?.[Symbol.dispose]());
	return () => props.children;
}

/** Transparent same-target component that consumes the current physics body. */
export function GravityElement(this: ComponentInstance<{}>, props: GravityElementProps) {
	if (!this.hasContext(PhysicsBodyContext)) {
		this.log.error('Gravity enhancement requires a physics body', undefined, {
			enhancement: '@exactjs/gravity#default',
			missingContext: 'PhysicsBodyContext'
		});
		return () => props.children;
	}
	const physics = this.getContext(PhysicsBodyContext);
	const registration = new BodyGravityRegistration();
	let active = false;
	let configuration!: BodyGravityConfiguration;
	watch(() => {
		configuration = {
			world: physics.world,
			body: physics.body,
			field: unwrap(props.apply),
			scale: props.scale ?? 1,
			disabled: props.disabled ?? false,
			attractor: unwrap(props.attractor)
		};
		if (active) registration.configure(configuration);
	});
	this.onActivate(() => {
		active = true;
		registration.configure(configuration);
	});
	this.onDeactivate(() => {
		active = false;
		registration.configure({ ...configuration, disabled: true });
	});
	this.onUnmount(() => registration[Symbol.dispose]());
	return () => props.children;
}
