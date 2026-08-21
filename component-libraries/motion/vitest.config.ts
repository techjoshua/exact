import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include: /[\\/](?:context|layout|motion-element|motion-list|motion|presence)\.ts$/,
				reactCompatibility: false
			}
		})
	],
	test: { environment: 'node' }
});
