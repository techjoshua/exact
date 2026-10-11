import { mergeConfig, defineConfig } from 'vitest/config';
import workspace from '../../vitest.config.js';

export default mergeConfig(
	workspace,
	defineConfig({
		test: {
			include: [
				'framework-adapters/vite-plugin/test-support/development-theme-browser.acceptance.ts',
				'framework-adapters/vite-plugin/test-support/installed-provider-browser.acceptance.ts'
			]
		}
	})
);
