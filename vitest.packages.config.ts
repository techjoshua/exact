import { configDefaults, defineConfig } from 'vitest/config';

const packageProjectConfigs = [
	'packages/hydrate/vitest.config.ts',
	'packages/ssr/vitest.config.ts',
	'packages/testing/vitest.config.ts',
	'react-adapters/convex/vitest.config.ts',
	'react-adapters/jotai/vitest.config.ts',
	'react-adapters/redux/vitest.config.ts',
	'react-adapters/tanstack-query/vitest.config.ts',
	'plugins/microfrontends/vitest.config.ts',
	'component-libraries/forms/vitest.config.ts',
	'component-libraries/gravity/vitest.config.ts',
	'component-libraries/motion/vitest.config.ts',
	'component-libraries/physics/vitest.config.ts',
	'component-libraries/router/vitest.config.ts',
	'component-libraries/theme-fixture/vitest.config.ts'
] as const;

const packageProjectDirectories = packageProjectConfigs.map((configPath) =>
	configPath.replace('/vitest.config.ts', '/**')
);

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
