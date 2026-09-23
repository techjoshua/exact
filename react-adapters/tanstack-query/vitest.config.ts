import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				compileTestModules: true,
				debug: { runtime: false, catalog: false },
				include: /src[\\/]adapter\.ts$/,
				reactCompatibility: false
			}
		})
	]
});
