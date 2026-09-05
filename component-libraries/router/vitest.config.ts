import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	root: import.meta.dirname,
	plugins: [
		exactVitest({
			compiler: { include: /(?:components|\.fixtures)\.tsx$/, reactCompatibility: false }
		})
	],
	test: {
		exclude: ['src/components.server.test.tsx']
	}
});
