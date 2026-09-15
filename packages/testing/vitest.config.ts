import { exactVitest } from '@exactjs/vitest';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include: /(?:mounting[\\/]mount\.ts$|\.fixtures\.test\.tsx$)/,
				compileTestModules: true,
				reactCompatibility: false
			}
		})
	],
	test: { exclude: [...configDefaults.exclude, '**/*.fixtures.test.*'] }
});
