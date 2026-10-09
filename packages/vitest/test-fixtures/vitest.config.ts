import { defineConfig } from 'vitest/config';
import { exactVitest } from '@exactjs/vitest';

export default defineConfig({
	plugins: [exactVitest({ compiler: { compileTestModules: true } })],
	test: {
		environment: 'jsdom',
		include: ['test-fixtures/**/*.integration.tsx', 'test-fixtures/**/*.test.tsx']
	}
});
