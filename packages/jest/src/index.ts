import { fileURLToPath } from 'node:url';
import {
	resolveReactCompatibility,
	type ReactCompatibilityOptions
} from '@exactjs/react-compat/plugin';

export {
	exactMatchers,
	installJestMatchers,
	type ExactMatcherDeclarations,
	type ExpectLike
} from '@exactjs/testing/jest';
export * from '@exactjs/testing';

/** Defines the Jest configuration fragment created by eXact. */
export type ExactJestConfig = {
	globalSetup: string;
	globalTeardown: string;
	resolver: string;
	setupFiles: string[];
	setupFilesAfterEnv: string[];
	testEnvironment?: string;
	extensionsToTreatAsEsm: string[];
	transform: Record<string, string | [string, unknown]>;
	moduleNameMapper: Record<string, string>;
};

/** Configures the compiler and environment behavior contributed to Jest. */
export type ExactJestOptions = {
	testEnvironment?: string | false;
	compiler?: {
		reactCompatibility?: boolean | ReactCompatibilityOptions;
	};
};

/** Creates a Jest configuration fragment with eXact matchers installed. */
export function exactJest(options: ExactJestOptions = {}): ExactJestConfig {
	const reactOptions = options.compiler?.reactCompatibility;
	const compatibility =
		reactOptions === undefined ? undefined : resolveReactCompatibility(reactOptions);
	return {
		globalSetup: fileURLToPath(new URL('./global-setup.js', import.meta.url)),
		globalTeardown: fileURLToPath(new URL('./global-teardown.js', import.meta.url)),
		resolver: fileURLToPath(new URL('./resolver.js', import.meta.url)),
		setupFiles: [fileURLToPath(new URL('./polyfills.js', import.meta.url))],
		setupFilesAfterEnv: [fileURLToPath(new URL('./setup.js', import.meta.url))],
		extensionsToTreatAsEsm: ['.ts', '.tsx'],
		transform: {
			'^.+\\.tsx?$': [
				fileURLToPath(new URL('./transformer.js', import.meta.url)),
				reactOptions === undefined ? {} : { reactCompatibility: reactOptions }
			]
		},
		moduleNameMapper: {
			...(compatibility
				? Object.fromEntries(
						Object.entries(compatibility.aliases).map(([source, replacement]) => [
							`^${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
							replacement
						])
					)
				: {}),
			'^(\\.{1,2}/.*)\\.js$': '$1'
		},
		...(options.testEnvironment === false
			? {}
			: { testEnvironment: options.testEnvironment ?? 'jest-environment-jsdom' })
	};
}
