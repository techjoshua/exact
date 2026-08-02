import { GravityFieldComponent } from './components.js';
import type { GravityField as GravityFieldContract } from './contracts.js';

export { applyGravity } from './application.js';
export { defineGravityAttractor } from './attractors.js';
export { GravityElement } from './components.js';
/** Ordinary field-registration component paired with the `GravityField` prepared-value type. */
export const GravityField = GravityFieldComponent;
/** Pure prepared acceleration field contract. */
export type GravityField = GravityFieldContract;
export {
	boundedGravity,
	combineGravity,
	defineGravityField,
	directionalGravity,
	pointGravity,
	radialGravity,
	uniformGravity
} from './fields.js';
export { BodyGravityRegistration } from './registration.js';
export type {
	BodyGravityConfiguration,
	BoundedGravityOptions,
	GravityApplication,
	GravityApplicationInspection,
	GravityApplicationOptions,
	GravityAttractorDefinition,
	GravityAttractorInput,
	GravityElementProps,
	GravityFieldOptions,
	GravityFieldProps,
	GravityPluginConfig,
	GravitySamplePoint,
	PointGravityOptions,
	RadialGravityOptions
} from './contracts.js';

export { GravityElement as default } from './components.js';
