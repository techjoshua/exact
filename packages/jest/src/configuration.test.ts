import { describe, expect, it } from 'vitest';
import { exactJest } from './index.js';

describe('@exactjs/jest', () => {
	it('provides matcher setup and a DOM-capable default environment', () => {
		expect(exactJest()).toMatchObject({
			globalSetup: expect.stringMatching(/global-setup\.js$/),
			globalTeardown: expect.stringMatching(/global-teardown\.js$/),
			resolver: expect.stringMatching(/resolver\.js$/),
			setupFiles: [expect.stringMatching(/polyfills\.js$/)],
			setupFilesAfterEnv: [expect.stringMatching(/setup\.js$/)],
			testEnvironment: 'jest-environment-jsdom',
			extensionsToTreatAsEsm: ['.ts', '.tsx'],
			transform: {
				'^.+\\.tsx?$': [expect.stringMatching(/transformer\.js$/), {}]
			},
			moduleNameMapper: {
				'^(\\.{1,2}/.*)\\.js$': '$1'
			}
		});
	});

	it('allows applications to retain their own test environment', () => {
		expect(exactJest({ testEnvironment: false })).not.toHaveProperty('testEnvironment');
	});

	it('maps the selected React runtime and forwards compiler ownership options', () => {
		const config = exactJest({ compiler: { reactCompatibility: { target: 19 } } });
		expect(config.moduleNameMapper['^react$']).toBe('@exactjs/react-compat/react19');
		expect(config.transform['^.+\\.tsx?$']).toEqual([
			expect.stringMatching(/transformer\.js$/),
			{ reactCompatibility: { target: 19 } }
		]);
	});
});
