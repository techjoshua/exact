import type * as fields from '../../../component-libraries/gravity/src/fields.js';
import type { defineGravityAttractor } from '../../../component-libraries/gravity/src/attractors.js';
import type { sampleGravity } from '../../../component-libraries/gravity/src/testing.js';

/** Executes ordinary alias, independent-result and numerical-validation controls. */
export function verifyGravityReadonlyValues(api: {
	uniformGravity: typeof fields.uniformGravity;
	defineGravityField: typeof fields.defineGravityField;
	defineGravityAttractor: typeof defineGravityAttractor;
	sampleGravity: typeof sampleGravity;
}): true;
