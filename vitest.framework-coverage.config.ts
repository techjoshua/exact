import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Preserve each package's compiler target, aliases, and setup while measuring owned source.
export default defineConfig({
	test: {
		maxWorkers: 2,
		projects: [
			{
				extends: './vitest.config.ts',
				test: {
					name: 'runtime-default',
					include: [
						'packages/{core,reactive,dom,server,request,plugin-api,plugin-host,devtools-runtime,devtools-protocol}/src/**/*.test.{ts,tsx}'
					]
				}
			},
			'packages/hydrate/vitest.config.ts',
			'packages/ssr/vitest.config.ts',
			'packages/testing/vitest.config.ts',
			'packages/component-composition-corpus/vitest.config.ts',
			{
				extends: './component-libraries/router/vitest.config.ts',
				root: fileURLToPath(new URL('./component-libraries/router/', import.meta.url)),
				test: { name: 'router-client', include: ['src/**/*.test.{ts,tsx}'] }
			},
			{
				extends: './component-libraries/router/vitest.server.config.ts',
				root: fileURLToPath(new URL('./component-libraries/router/', import.meta.url)),
				test: { name: 'router-server', include: ['src/components.server.test.tsx'] }
			}
		],
		coverage: {
			provider: 'v8',
			reporter: ['text-summary', 'json', 'json-summary', 'html'],
			reportsDirectory: '.tmp/framework-confidence/coverage',
			include: [
				'packages/{core,reactive,dom,ssr,hydrate,server,testing,request,plugin-api,plugin-host,devtools-runtime,devtools-protocol}/src/**/*.{ts,tsx}',
				'component-libraries/router/src/**/*.{ts,tsx}'
			],
			exclude: [
				'**/*.test.{ts,tsx}',
				'**/*.d.ts',
				'**/test-support/**',
				'**/fixtures/**',
				'**/*.fixtures.{ts,tsx}'
			]
		}
	}
});
