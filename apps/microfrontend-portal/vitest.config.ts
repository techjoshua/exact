import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	esbuild: { jsx: 'automatic', jsxImportSource: '@exact/jsx' },
	resolve: {
		alias: {
			'@exact/sample-microfrontend-portal/shared': path.join(root, 'src', 'shared.ts')
		}
	},
	test: { testTimeout: 60_000 }
});
