import { PhysicsWorldComponent } from './components.js';
import type { PhysicsWorld as PhysicsWorldContract } from './contracts.js';

export { createPhysicsWorld } from './world.js';
export { definePhysicsCollisionListener } from './collisions.js';
export { PhysicsElement } from './components.js';
/** Ordinary component value paired with the `PhysicsWorld` resource type. */
export const PhysicsWorld = PhysicsWorldComponent;
/** DOM-independent world resource contract. */
export type PhysicsWorld = PhysicsWorldContract;
export { PhysicsBodyContext, PhysicsWorldContext } from './context.js';
export {
	definePhysicsProjection,
	positionAndRotation,
	positionOnly,
	rotationOnly,
	stateOnly
} from './projections.js';
export type {
	ForceContributor,
	PhysicsBody,
	PhysicsBodyDefinition,
	PhysicsCollisionEvent,
	PhysicsCollisionListener,
	PhysicsCollisionPhase,
	PhysicsElementProps,
	PhysicsConstraint,
	PhysicsConstraintDefinition,
	PhysicsPose,
	PhysicsProjection,
	PhysicsProjectionChannel,
	PhysicsProjectionContext,
	PhysicsProjectionInput,
	PhysicsPluginConfig,
	PhysicsShape,
	PhysicsStepResult,
	PhysicsWorldInspection,
	PhysicsWorldOptions,
	PhysicsWorldProps,
	SetPoseOptions,
	Vector2
} from './contracts.js';

export { PhysicsElement as default } from './components.js';
