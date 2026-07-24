import { describe, expect, it } from 'vitest';
import { exactJest } from './index.js';

describe('@exactjs/jest', () => {
	it('provides matcher setup and a DOM-capable default environment', () => {
		expect(exactJest()).toMatchObject({
			setupFiles: [expect.stringMatching(/polyfills\.js$/)],
			setupFilesAfterEnv: [expect.stringMatching(/setup\.js$/)],
			testEnvironment: 'jest-environment-jsdom',
			extensionsToTreatAsEsm: ['.ts', '.tsx'],
			transform: {
				'^.+\\.tsx?$': expect.stringMatching(/transformer\.js$/)
			},
			moduleNameMapper: {
				'^(\\.{1,2}/.*)\\.js$': '$1'
			}
		});
	});

	it('allows applications to retain their own test environment', () => {
		expect(exactJest({ testEnvironment: false })).not.toHaveProperty('testEnvironment');
	});
});
