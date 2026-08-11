import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exactVitest } from '@exactjs/vitest';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [exactVitest({ compiler: { include: /[\\/]src[\\/].*\.tsx$/ } })],
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
