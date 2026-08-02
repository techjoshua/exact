import type { Child } from '@exactjs/core';
import type { PhysicsBody, PhysicsWorld, Vector2 } from '@exactjs/physics';

declare const preparedGravityField: unique symbol;
declare const preparedGravityAttractor: unique symbol;

/** Input to one pure field sample. */
export interface GravitySamplePoint {
	readonly position: Vector2;
	readonly time: number;
	readonly mass: number;
}

/** Immutable pure acceleration field. */
export interface GravityField {
	readonly name: string;
	readonly kind: string;
	readonly parameters: Readonly<Record<string, unknown>>;
	readonly [preparedGravityField]: true;
	accelerationAt(point: GravitySamplePoint): Vector2;
}

/** Shared options for finite built-in acceleration fields. */
export interface GravityFieldOptions {
	readonly name?: string;
	readonly maxAcceleration?: number;
}

/** Configuration for a point-mass inverse-square attractor. */
export interface PointGravityOptions extends GravityFieldOptions {
	readonly position: Vector2;
	readonly strength: number;
	readonly softening: number;
}

/** Configuration for a radial field centered on one point. */
export interface RadialGravityOptions extends GravityFieldOptions {
	readonly center: Vector2;
	readonly acceleration: number;
	readonly radius?: number;
	readonly falloff?: 'constant' | 'linear' | 'inverse-square';
	readonly softening?: number;
}

/** Bounds another field to an axis-aligned world volume. */
export interface BoundedGravityOptions {
	readonly min: Vector2;
	readonly max: Vector2;
	readonly name?: string;
}

/** Selection and scaling policy for one world registration. */
export interface GravityApplicationOptions {
	readonly name?: string;
	readonly order?: number;
	readonly scale?: number | (() => number);
	readonly enabled?: boolean | (() => boolean);
	readonly groups?: readonly string[];
	readonly collisionLayers?: readonly string[];
	readonly bodies?: Iterable<PhysicsBody>;
	readonly predicate?: (body: PhysicsBody) => boolean;
}

/** Bounded inspection for one gravity-to-world registration. */
export interface GravityApplicationInspection {
	readonly name: string;
	readonly field: string;
	readonly selectedBodies: number;
	readonly sampleCount: number;
	readonly clampCount: number;
}

/** Owned gravity registration in a physics world. */
export interface GravityApplication extends Disposable {
	inspect(): GravityApplicationInspection;
}

/** A moving point attractor derived from the target physics body's pose. */
export interface GravityAttractorDefinition extends GravityFieldOptions {
	readonly strength: number;
	readonly softening: number;
	readonly order?: number;
	readonly [preparedGravityAttractor]: true;
}

/** Author input accepted by {@link defineGravityAttractor}. */
export type GravityAttractorInput = Omit<
	GravityAttractorDefinition,
	typeof preparedGravityAttractor
>;

/** Props for a subtree-wide field registration. */
export interface GravityFieldProps extends GravityApplicationOptions {
	readonly field: GravityField;
	readonly children?: Child;
}

/** Canonical props accepted by the plugin-owned JSX namespace. */
export interface GravityElementProps {
	readonly apply?: GravityField;
	readonly scale?: number;
	readonly disabled?: boolean;
	readonly attractor?: GravityAttractorDefinition;
	readonly children?: Child;
}

/** Application configuration accepted by the gravity plugin. */
export interface GravityPluginConfig {
	readonly enabled: boolean;
	readonly maxAcceleration: number;
}

/** Internal configurable attachment used by the ordinary components. */
export interface BodyGravityConfiguration {
	readonly world: PhysicsWorld;
	readonly body: PhysicsBody;
	readonly field?: GravityField;
	readonly scale: number;
	readonly disabled: boolean;
	readonly attractor?: GravityAttractorDefinition;
}
