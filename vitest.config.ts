import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	oxc: {
		jsx: {
			runtime: 'automatic',
			importSource: '@exactjs/jsx'
		}
	},
	test: {
		exclude: [...configDefaults.exclude, '**/dist/**']
	}
});
