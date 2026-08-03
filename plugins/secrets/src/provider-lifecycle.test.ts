import type { ExactPluginConfigContext } from '@exactjs/plugin-api';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SecretsPluginConfig } from './config.js';
import controller from './plugin-config.js';
import { environmentSecrets, parseEnvironmentFile } from './providers.js';
import createSecretsServerExtension, { createSecretResolver } from './server.js';
import { secret } from './values.js';

describe('secret provider and resolver lifecycle', () => {
	it('loads environment files with exports, quotes, comments, and provider precedence', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-secrets-'));
		writeFileSync(
			path.join(root, '.env'),
			[
				'# ignored',
				'export API_KEY = "file value"',
				"QUOTED='literal # value'",
				'COMMENTED=value # explanation',
				''
			].join('\n')
		);
		const provider = environmentSecrets({
			includeProcessEnvironment: false,
			files: ['missing.env', '.env']
		});

		const values = await provider.load(providerContext(root));

		expect(values.API_KEY).toBe('file value');
		expect(values.QUOTED).toBe('literal # value');
		expect(values.COMMENTED).toBe('value');
		expect(Object.isFrozen(values)).toBe(true);
	});

	it('distinguishes optional missing files from required and unreadable files', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-secrets-errors-'));
		await expect(
			environmentSecrets({
				includeProcessEnvironment: false,
				files: ['missing.env']
			}).load(providerContext(root))
		).resolves.toEqual({});
		await expect(
			environmentSecrets({
				includeProcessEnvironment: false,
				files: ['missing.env'],
				optionalFiles: false
			}).load(providerContext(root))
		).rejects.toThrow(`Unable to load secret environment file ${path.join(root, 'missing.env')}`);
	});

	it('rejects malformed declarations and accepts empty or comment-only files', () => {
		expect(parseEnvironmentFile('\n# comment\n')).toEqual(new Map());
		expect(() => parseEnvironmentFile('1INVALID=value')).toThrow(
			'Malformed environment secret declaration'
		);
	});

	it('applies later providers, guards initialization, and clears secrets on disposal', async () => {
		const resolver = createSecretResolver(
			{
				providers: [
					{
						name: 'first',
						async load() {
							return { TOKEN: secret('TOKEN', 'first') };
						}
					},
					{
						name: 'second',
						async load() {
							return { TOKEN: secret('TOKEN', 'second') };
						}
					}
				],
				required: ['TOKEN'],
				allowPackages: []
			},
			providerContext('/app')
		);

		expect(() => resolver.optional('TOKEN')).toThrow('has not been initialized');
		await resolver.initialize();
		await resolver.initialize();
		expect(resolver.require('TOKEN')).toBe('second');
		expect(() => resolver.require('MISSING')).toThrow('Secret MISSING is not configured');
		await resolver.dispose();
		expect(() => resolver.optional('TOKEN')).toThrow('has not been initialized');
	});

	it('validates and projects plugin configuration without exposing providers', async () => {
		const context = pluginContext('/app');
		const defaults = await controller.defaults(context);
		expect(defaults.providers).toHaveLength(1);
		expect(controller.structuralValidate?.(defaults, context)).toBeUndefined();
		expect(await controller.validate(defaults, context)).toBeUndefined();
		expect(await controller.renderConfig?.(defaults, context)).toEqual({});

		const invalidShapes = [
			null,
			{ providers: {}, required: [], allowPackages: [] },
			{ providers: [], required: [''], allowPackages: [] },
			{ providers: [], required: [], allowPackages: [''] }
		] as unknown as SecretsPluginConfig[];
		for (const invalid of invalidShapes) {
			expect(() => controller.structuralValidate?.(invalid, context)).toThrow(
				'Invalid @exactjs/secrets configuration'
			);
		}
		expect(() =>
			controller.validate({ providers: [], required: [], allowPackages: [] }, context)
		).toThrow('requires at least one secret provider');
		expect(() =>
			controller.validate(
				{
					providers: defaults.providers,
					required: ['TOKEN', 'TOKEN'],
					allowPackages: []
				},
				context
			)
		).toThrow('required secret TOKEN is listed more than once');
		expect(() =>
			controller.validate(
				{
					providers: defaults.providers,
					required: [],
					allowPackages: ['package', 'package']
				},
				context
			)
		).toThrow('package package is allowed more than once');
	});

	it('creates an application resource that initializes and disposes its resolver', async () => {
		let loads = 0;
		const config: SecretsPluginConfig = {
			providers: [
				{
					name: 'counted',
					async load() {
						loads++;
						return { TOKEN: secret('TOKEN', 'value') };
					}
				}
			],
			required: ['TOKEN'],
			allowPackages: []
		};
		const context = pluginContext('/app');
		const resolver = (await controller.serverConfig?.(config, context)) as ReturnType<
			typeof createSecretResolver
		>;
		const extension = createSecretsServerExtension(resolver);

		await extension.validate?.();
		const resource = await extension.initializeApplication?.(context);
		expect(loads).toBe(1);
		await resource?.dispose();
		await extension.validate?.();
		expect(loads).toBe(2);
	});
});

function providerContext(applicationRoot: string) {
	return {
		applicationRoot,
		environment: 'test',
		signal: new AbortController().signal
	};
}

function pluginContext(applicationRoot: string): ExactPluginConfigContext {
	return {
		plugin: { packageName: '@exactjs/secrets', version: '1.0.0' },
		contributor: { packageName: '@app/root', version: '1.0.0' },
		applicationRoot,
		environment: 'test',
		hostMode: 'server',
		signal: new AbortController().signal,
		executionIndex: 0,
		provenance: { activationPaths: [], orderingAfter: [] }
	};
}
