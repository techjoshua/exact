import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { build } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { createInstalledThemeFixture } from '../../test-support/installed-theme.js';
import { exact } from './index.js';

it.each(['authored', 'paired', 'published', 'library'] as const)(
	'renders installed enhancements and module-owned formatters in production (%s)',
	async (mode) => {
		const fixture = await createInstalledThemeFixture(mode);
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
			},
			ssr: { noExternal: true }
		});
		const result = await promisify(execFile)(
			process.execPath,
			[path.join(fixture.root, 'bundle/server.mjs')],
			{ timeout: 10_000 }
		);
		expect(JSON.parse(result.stdout)).toEqual({ scope: true, field: true, input: true });
	},
	30_000
);
