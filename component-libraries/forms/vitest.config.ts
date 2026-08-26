import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include: /(?:form-behavior\.fixtures|form[\\/](?:controls|feedback|field|form))\.tsx?$/,
				reactCompatibility: false
			}
		})
	],
	test: { environment: 'jsdom' }
});
