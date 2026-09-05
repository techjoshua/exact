import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	root: import.meta.dirname,
	plugins: [
		exactVitest({
			compiler: {
				target: 'server',
				include: /(?:components|components\.server\.test)\.tsx$/,
				reactCompatibility: false
			}
		})
	],
	test: {
		include: ['src/components.server.test.tsx']
	}
});
