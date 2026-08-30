import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include: /[\\/]src[\\/]server\.tsx$/,
				target: 'server',
				renderMode: 'server-render',
				reactCompatibility: false
			}
		})
	]
});
