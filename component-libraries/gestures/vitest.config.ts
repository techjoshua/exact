import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		exactVitest({
			compiler: {
				include: /src[\\/](?:context|gesture-element)\.ts$/,
				reactCompatibility: false
			}
		})
	],
	resolve: { conditions: ['browser'] }
});
