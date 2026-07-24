import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	// These integration fixtures deliberately load three source roots through the raw
	// automatic runtime. Ordinary application tests should use @exactjs/vitest instead.
	oxc: {
		jsx: {
			runtime: 'automatic',
			importSource: '@exactjs/jsx'
		}
	},
	resolve: {
		alias: {
			'@exactjs/sample-microfrontend-portal/shared': path.join(root, 'src', 'shared.ts')
		}
	},
	test: { testTimeout: 60_000 }
});
