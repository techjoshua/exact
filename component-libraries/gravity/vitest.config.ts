import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include: /src[\\/](?:components\.ts|.*\.fixtures\.tsx)$/,
				reactCompatibility: false
			}
		})
	],
	resolve: { conditions: ['browser'] }
});
