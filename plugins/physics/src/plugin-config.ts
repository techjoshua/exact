import type { ExactPluginConfigController } from '@exactjs/plugin-api';
import type { PhysicsPluginConfig } from './contracts.js';

const controller: ExactPluginConfigController<PhysicsPluginConfig> = {
	defaults: () => ({ enabled: true, fixedStep: 1 / 120, maxCatchUpSteps: 8 }),
	structuralValidate: validate,
	validate,
	compilerConfig: (config) => ({ cacheKey: { contract: 1, ...config } }),
	renderConfig: freeze,
	clientConfig: freeze,
	testingConfig: freeze
};

export default controller;

function validate(config: PhysicsPluginConfig): undefined {
	if (!config || typeof config !== 'object' || typeof config.enabled !== 'boolean') {
		throw new TypeError('Invalid @exactjs/physics configuration');
	}
	if (!Number.isFinite(config.fixedStep) || config.fixedStep <= 0) {
		throw new RangeError('Physics fixedStep must be positive and finite');
	}
	if (!Number.isInteger(config.maxCatchUpSteps) || config.maxCatchUpSteps <= 0) {
		throw new RangeError('Physics maxCatchUpSteps must be a positive integer');
	}
	return undefined;
}

function freeze(config: PhysicsPluginConfig): PhysicsPluginConfig {
	return Object.freeze({ ...config });
}
