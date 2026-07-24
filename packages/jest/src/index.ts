import { fileURLToPath } from 'node:url';

export {
	exactMatchers,
	installJestMatchers,
	type ExactMatcherDeclarations,
	type ExpectLike
} from '@exactjs/testing/jest';
export * from '@exactjs/testing';

/** Defines the Jest configuration fragment created by eXact. */
export type ExactJestConfig = {
	setupFiles: string[];
	setupFilesAfterEnv: string[];
	testEnvironment?: string;
	extensionsToTreatAsEsm: string[];
	transform: Record<string, string>;
	moduleNameMapper: Record<string, string>;
};

/** Creates a Jest configuration fragment with eXact matchers installed. */
export function exactJest(options: { testEnvironment?: string | false } = {}): ExactJestConfig {
	return {
		setupFiles: [fileURLToPath(new URL('./polyfills.js', import.meta.url))],
		setupFilesAfterEnv: [fileURLToPath(new URL('./setup.js', import.meta.url))],
		extensionsToTreatAsEsm: ['.ts', '.tsx'],
		transform: {
			'^.+\\.tsx?$': fileURLToPath(new URL('./transformer.js', import.meta.url))
		},
		moduleNameMapper: {
			'^(\\.{1,2}/.*)\\.js$': '$1'
		},
		...(options.testEnvironment === false
			? {}
			: { testEnvironment: options.testEnvironment ?? 'jest-environment-jsdom' })
	};
}
