import type { GravityAttractorDefinition, GravityAttractorInput } from './contracts.js';

const prepared = Symbol('exact.gravity.attractor');

/** Validates and freezes a reusable moving-body attractor definition. */
export function defineGravityAttractor(input: GravityAttractorInput): GravityAttractorDefinition {
	if (!Number.isFinite(input.strength) || input.strength < 0) {
		throw new RangeError('Gravity attractor strength must be non-negative and finite');
	}
	if (!Number.isFinite(input.softening) || input.softening <= 0) {
		throw new RangeError('Gravity attractor softening must be positive and finite');
	}
	if (
		input.maxAcceleration !== undefined &&
		(!Number.isFinite(input.maxAcceleration) || input.maxAcceleration <= 0)
	) {
		throw new RangeError('Gravity attractor maxAcceleration must be positive and finite');
	}
	return Object.freeze({ ...input, [prepared]: true }) as unknown as GravityAttractorDefinition;
}
