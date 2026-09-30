import { defineConfig } from 'vitest/config';
import applicationConfig from './vitest.config.js';

export default defineConfig({
	...applicationConfig,
	test: {
		...applicationConfig.test,
		include: ['manual/ssr-allocation.test.ts'],
		fileParallelism: false,
		maxWorkers: 1,
		pool: 'threads',
		testTimeout: 120_000
	}
});
