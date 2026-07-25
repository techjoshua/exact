import { defineConfig } from 'vitest/config';
import { exactVitest } from '@exactjs/vitest';

export default defineConfig({
	plugins: [exactVitest()],
	test: {
		environment: 'jsdom',
		include: ['test-fixtures/**/*.integration.tsx']
	}
});
