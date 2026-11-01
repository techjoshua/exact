import { exactVitest } from '@exactjs/vitest';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	root: import.meta.dirname,
	plugins: [
		exactVitest({
			compiler: { include: /(?:components|\.fixtures)\.tsx$/, reactCompatibility: false }
		})
	],
	test: {
		exclude: [
			...configDefaults.exclude,
			'src/components.server.test.tsx',
			'**/.tmp/**',
			'**/dist/**'
		]
	}
});
