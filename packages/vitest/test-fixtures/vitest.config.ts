import { defineConfig } from 'vitest/config';
import { exactVitest } from '../dist/index.js';

export default defineConfig({
	plugins: [exactVitest()],
	test: {
		environment: 'jsdom',
		include: ['test-fixtures/**/*.integration.tsx']
	}
});
