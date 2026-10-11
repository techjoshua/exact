import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { build } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { createInstalledThemeFixture } from '../../test-support/installed-theme.js';
import { exact } from './index.js';

it.each(['authored', 'paired', 'published', 'library', 'duplicate'] as const)(
	'renders installed enhancements and module-owned formatters in production (%s)',
	async (mode) => {
		for (const availability of mode === 'duplicate'
			? (['enabled', 'excluded', 'absent', 'library-only', 'delegated'] as const)
			: (['enabled'] as const)) {
			const fixture = await createInstalledThemeFixture(
				mode === 'duplicate' ? 'library' : mode,
				availability,
				mode === 'duplicate'
			);
			onTestFinished(fixture.dispose);
			await build({
				root: fixture.root,
				configFile: false,
				logLevel: 'silent',
				plugins: [
					exact({
						applicationRoot: fixture.root,
						target: 'server',
						serverComponents: true,
						reactCompatibility: false
					})
				],
				build: {
					ssr: path.join(fixture.root, 'run.ts'),
					outDir: path.join(fixture.root, 'bundle'),
					rollupOptions: { output: { entryFileNames: 'server.mjs' } }
				}
			});
			const result = await promisify(execFile)(
				process.execPath,
				[path.join(fixture.root, 'bundle/server.mjs')],
				{ timeout: 10_000 }
			);
			expect(JSON.parse(result.stdout)).toEqual({
				scope:
					availability === 'enabled' ||
					availability === 'library-only' ||
					availability === 'delegated',
				field:
					availability === 'enabled' ||
					availability === 'library-only' ||
					availability === 'delegated',
				input: true
			});
		}
	},
	60_000
);
