import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include: /src[\\/](?:client|[^\\/]+\.fixtures)\.tsx?$/,
				compileTestModules: true,
				reactCompatibility: false
			}
		})
	]
});
