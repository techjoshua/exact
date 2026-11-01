import type { GravityAttractorDefinition, GravityAttractorInput } from './contracts.js';

/** Validates and copies a moving-body attractor definition with TypeScript readonly fields. */
export function defineGravityAttractor(input: GravityAttractorInput): GravityAttractorDefinition {
	const definition = { ...input };
	if (!Number.isFinite(definition.strength) || definition.strength < 0) {
		throw new RangeError('Gravity attractor strength must be non-negative and finite');
	}
	if (!Number.isFinite(definition.softening) || definition.softening <= 0) {
		throw new RangeError('Gravity attractor softening must be positive and finite');
	}
	if (
		definition.maxAcceleration !== undefined &&
		(!Number.isFinite(definition.maxAcceleration) || definition.maxAcceleration <= 0)
	) {
		throw new RangeError('Gravity attractor maxAcceleration must be positive and finite');
	}
	return definition as unknown as GravityAttractorDefinition;
}
