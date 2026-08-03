import type { ExactPluginConfigContext } from '@exactjs/plugin-api';
import { describe, expect, it } from 'vitest';
import {
	allProvidedPackageKeys,
	mandatoryExactProvidedPackages,
	readExactMicrofrontendBuildConfig
} from './plugin-config.js';
import controller from './plugin-config.js';

const context: ExactPluginConfigContext = {
	plugin: { packageName: '@exactjs/microfrontends', version: '0.1.0' },
	contributor: { packageName: '@company/app', version: '1.0.0' },
	applicationRoot: '/workspace/app',
	environment: 'test',
	hostMode: 'build',
	signal: new AbortController().signal,
	executionIndex: 0,
	provenance: { activationPaths: [], orderingAfter: [] }
};

describe('microfrontends build configuration', () => {
	it('round-trips the bounded JSON build projection', () => {
		const config = readExactMicrofrontendBuildConfig({
			exposes: [['./Area', { component: './src/Area.tsx' }]],
			providedPackages: [...mandatoryExactProvidedPackages, '@company/contexts'],
			remoteBindings: [['billing', { clientEntry: 'https://cdn.example.test/billing.js' }]]
		});

		expect(config).toEqual({
			exposes: [['./Area', { component: './src/Area.tsx' }]],
			providedPackages: [...mandatoryExactProvidedPackages, '@company/contexts'],
			remoteBindings: [['billing', { clientEntry: 'https://cdn.example.test/billing.js' }]]
		});
		expect(config.providedPackages).toContain('@exactjs/jsx/jsx-runtime');
	});

	it('rejects malformed or incomplete adapter input', () => {
		expect(() =>
			readExactMicrofrontendBuildConfig({
				exposes: [['./Area', { component: '' }]],
				providedPackages: [],
				remoteBindings: []
			})
		).toThrow('Invalid microfrontends build configuration');
		expect(() =>
			readExactMicrofrontendBuildConfig({
				exposes: [],
				providedPackages: []
			})
		).toThrow('Invalid microfrontends build configuration');
	});

	it('creates deterministic build, server, and client projections', async () => {
		const config = {
			exposes: {
				'./Zulu': { component: './src/Zulu.tsx' },
				'./Alpha': { component: './src/Alpha.tsx' }
			},
			remotes: {
				billing: {
					endpoint: 'https://server.example.test/billing',
					clientEntry: 'https://cdn.example.test/billing.js',
					clientEntryResolver: './resolve-billing.js'
				}
			},
			providedPackages: ['@company/ui']
		};

		const buildConfig = await controller.buildConfig?.(config, context);
		expect(buildConfig).toEqual({
			exposes: [
				['./Alpha', { component: './src/Alpha.tsx' }],
				['./Zulu', { component: './src/Zulu.tsx' }]
			],
			providedPackages: allProvidedPackageKeys(['@company/ui']),
			remoteBindings: [
				[
					'billing',
					{
						clientEntry: 'https://cdn.example.test/billing.js',
						clientEntryResolver: './resolve-billing.js'
					}
				]
			]
		});
		expect(await controller.serverConfig?.(config, context)).toEqual({
			bindings: { billing: { endpoint: 'https://server.example.test/billing' } }
		});
		expect(await controller.clientConfig?.(config, context)).toEqual({
			bindings: {
				billing: {
					clientEntry: 'https://cdn.example.test/billing.js',
					clientEntryResolver: './resolve-billing.js'
				}
			}
		});
	});

	it('rejects ambiguous names, duplicate packages, and incomplete remote contracts', () => {
		const valid = {
			exposes: {},
			remotes: {},
			providedPackages: []
		};
		expect(() =>
			controller.validate(
				{
					...valid,
					exposes: { '': { component: './src/Area.tsx' } }
				},
				context
			)
		).toThrow('Invalid microfrontend exposure name');
		expect(() =>
			controller.validate(
				{
					...valid,
					remotes: {
						billing: { endpoint: '/billing', clientEntry: '' }
					}
				},
				context
			)
		).toThrow('Invalid microfrontend remote binding "billing"');
		expect(() =>
			controller.validate(
				{
					...valid,
					providedPackages: ['@company/ui', '@company/ui']
				},
				context
			)
		).toThrow('is listed twice');
	});

	it('rejects malformed remote resolver projections', () => {
		expect(() =>
			readExactMicrofrontendBuildConfig({
				exposes: [],
				providedPackages: [],
				remoteBindings: [
					[
						'billing',
						{ clientEntry: 'https://cdn.example.test/billing.js', clientEntryResolver: '' }
					]
				]
			})
		).toThrow('Invalid microfrontends build configuration');
	});
});
