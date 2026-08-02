import type { ExactPluginConfigController } from '@exactjs/plugin-api';
import type { GravityPluginConfig } from './contracts.js';

const controller: ExactPluginConfigController<GravityPluginConfig> = {
	defaults: () => ({ enabled: true, maxAcceleration: 100_000 }),
	structuralValidate: validate,
	validate,
	compilerConfig: (config) => ({ cacheKey: { contract: 1, ...config } }),
	renderConfig: freeze,
	clientConfig: freeze,
	testingConfig: freeze
};

export default controller;

function validate(config: GravityPluginConfig): undefined {
	if (!config || typeof config !== 'object' || typeof config.enabled !== 'boolean') {
		throw new TypeError('Invalid @exactjs/gravity configuration');
	}
	if (!Number.isFinite(config.maxAcceleration) || config.maxAcceleration <= 0) {
		throw new RangeError('Gravity maxAcceleration must be positive and finite');
	}
	return undefined;
}

function freeze(config: GravityPluginConfig): GravityPluginConfig {
	return Object.freeze({ ...config });
}
