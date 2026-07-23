import { describe, expect, it } from 'vitest';
import {
	mandatoryExactProvidedPackages,
	readExactMicrofrontendCompilerConfig
} from './plugin-config.js';

describe('microfrontends compiler configuration', () => {
	it('round-trips the bounded JSON build projection', () => {
		const config = readExactMicrofrontendCompilerConfig({
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
			readExactMicrofrontendCompilerConfig({
				exposes: [['./Area', { component: '' }]],
				providedPackages: [],
				remoteBindings: []
			})
		).toThrow('Invalid microfrontends compiler configuration');
		expect(() =>
			readExactMicrofrontendCompilerConfig({
				exposes: [],
				providedPackages: []
			})
		).toThrow('Invalid microfrontends compiler configuration');
	});
});
