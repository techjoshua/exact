import type { ExactPluginConfigController } from '@exact/plugin-api';
import type { SecretsPluginConfig } from './config.js';
import { environmentSecrets } from './providers.js';
import { createSecretResolver } from './server.js';

const controller: ExactPluginConfigController<SecretsPluginConfig> = {
	defaults() {
		return {
			providers: [environmentSecrets()],
			required: [],
			allowPackages: []
		};
	},
	structuralValidate: validateShape,
	validate(config) {
		validateShape(config);
		if (!config.providers.length)
			throw new Error('@exact/secrets requires at least one secret provider');
		const duplicate = config.required.find(
			(value, index) => config.required.indexOf(value) !== index
		);
		if (duplicate)
			throw new Error(`@exact/secrets required secret ${duplicate} is listed more than once`);
		const duplicatePackage = config.allowPackages.find(
			(value, index) => config.allowPackages.indexOf(value) !== index
		);
		if (duplicatePackage)
			throw new Error(`@exact/secrets package ${duplicatePackage} is allowed more than once`);
		return undefined;
	},
	compilerConfig(config) {
		return {
			cacheKey: {
				policyVersion: 3,
				allowPackages: [...config.allowPackages].sort()
			}
		};
	},
	serverConfig(config, context) {
		return createSecretResolver(config, {
			applicationRoot: context.applicationRoot,
			environment: context.environment,
			signal: context.signal
		});
	},
	renderConfig() {
		return Object.freeze({});
	}
};

export default controller;

function validateShape(value: SecretsPluginConfig): undefined {
	if (
		!value ||
		typeof value !== 'object' ||
		!Array.isArray(value.providers) ||
		!Array.isArray(value.required) ||
		!value.required.every((name) => typeof name === 'string' && name.length) ||
		!Array.isArray(value.allowPackages) ||
		!value.allowPackages.every(
			(packageName) => typeof packageName === 'string' && packageName.length
		)
	) {
		throw new Error('Invalid @exact/secrets configuration');
	}
	return undefined;
}
