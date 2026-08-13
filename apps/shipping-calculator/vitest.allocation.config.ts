import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['manual/ssr-allocation.test.ts'],
		fileParallelism: false,
		maxWorkers: 1,
		pool: 'threads',
		testTimeout: 120_000
	}
});
