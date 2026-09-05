import { configDefaults, defineConfig } from 'vitest/config';

const packageProjectConfigs = [
	'packages/component-composition-corpus/vitest.config.ts',
	'packages/hydrate/vitest.config.ts',
	'packages/ssr/vitest.config.ts',
	'packages/testing/vitest.config.ts',
	'react-adapters/convex/vitest.config.ts',
	'react-adapters/jotai/vitest.config.ts',
	'react-adapters/redux/vitest.config.ts',
	'react-adapters/tanstack-query/vitest.config.ts',
	'plugins/microfrontends/vitest.config.ts',
	'component-libraries/charts/vitest.config.ts',
	'component-libraries/charts/vitest.server.config.ts',
	'component-libraries/forms/vitest.config.ts',
	'component-libraries/gravity/vitest.config.ts',
	'component-libraries/motion/vitest.config.ts',
	'component-libraries/physics/vitest.config.ts',
	'component-libraries/router/vitest.config.ts',
	'component-libraries/theme-fixture/vitest.config.ts'
] as const;

const packageProjectDirectories = [
	...new Set(
		packageProjectConfigs.map(
			(configPath) => `${configPath.slice(0, configPath.lastIndexOf('/'))}/**`
		)
	)
];

export default defineConfig({
	test: {
		maxWorkers: 2,
		projects: [
			{
				extends: './vitest.config.ts',
				test: {
					name: 'workspace-default',
					exclude: [
						...configDefaults.exclude,
						'**/.tmp/**',
						'**/dist/**',
						'packages/bun-test/test-fixtures/**',
						...packageProjectDirectories
					]
				}
			},
			...packageProjectConfigs
		]
	}
});
