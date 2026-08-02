import type { ExactPluginConfigController } from '@exactjs/plugin-api';
import type { MotionPluginConfig } from './contracts.js';

const controller: ExactPluginConfigController<MotionPluginConfig> = {
	defaults() {
		return {
			enabled: true,
			reducedMotion: 'system',
			transition: { duration: 180, easing: 'ease-out' },
			appear: false
		};
	},
	structuralValidate: validate,
	validate,
	compilerConfig(config) {
		return {
			cacheKey: {
				contract: 1,
				enabled: config.enabled,
				reducedMotion: config.reducedMotion,
				appear: config.appear
			}
		};
	},
	renderConfig(config) {
		return Object.freeze({ ...config, transition: Object.freeze({ ...config.transition }) });
	},
	clientConfig(config) {
		return Object.freeze({ ...config, transition: Object.freeze({ ...config.transition }) });
	},
	testingConfig(config) {
		return Object.freeze({ ...config, transition: Object.freeze({ ...config.transition }) });
	}
};

export default controller;

function validate(config: MotionPluginConfig): undefined {
	if (
		!config ||
		typeof config !== 'object' ||
		typeof config.enabled !== 'boolean' ||
		!['system', 'always', 'never'].includes(config.reducedMotion) ||
		typeof config.appear !== 'boolean' ||
		!config.transition ||
		typeof config.transition !== 'object'
	)
		throw new TypeError('Invalid @exactjs/motion configuration');
	for (const name of ['duration', 'delay'] as const) {
		const value = config.transition[name];
		if (value !== undefined && (!Number.isFinite(value) || value < 0))
			throw new RangeError(`Motion transition ${name} must be a finite non-negative number`);
	}
	return undefined;
}
