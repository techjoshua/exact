import type { ExactPluginConfigController } from '@exactjs/plugin-api';
import type { GesturePluginConfig } from './contracts.js';

const controller: ExactPluginConfigController<GesturePluginConfig> = {
	defaults() {
		return { enabled: true, dragThreshold: 4, pressThreshold: 6 };
	},
	structuralValidate: validate,
	validate,
	renderConfig: freeze,
	clientConfig: freeze,
	testingConfig: freeze
};

export default controller;

function validate(config: GesturePluginConfig): undefined {
	if (!config || typeof config !== 'object' || typeof config.enabled !== 'boolean') {
		throw new TypeError('Invalid @exactjs/gestures configuration');
	}
	finiteThreshold(config.dragThreshold, 'dragThreshold');
	finiteThreshold(config.pressThreshold, 'pressThreshold');
	return undefined;
}

function finiteThreshold(value: number, name: string): void {
	if (!Number.isFinite(value) || value < 0) {
		throw new RangeError(`${name} must be non-negative and finite`);
	}
}

function freeze(config: GesturePluginConfig): GesturePluginConfig {
	return Object.freeze({ ...config });
}
