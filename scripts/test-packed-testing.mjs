import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createPackedAppInstaller } from './packed-app-dependencies.mjs';
import { runAcceptanceCommand } from './acceptance-process.mjs';

const workspace = path.resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'exact-packed-testing-'));
try {
	const mixed = process.argv.includes('--mixed');
	const install = await createPackedAppInstaller(
		workspace,
		temporary,
		mixed
			? {
					'@exactjs/dom': '0.6.2',
					'@exactjs/reactive': '0.6.2',
					'@exactjs/ssr': '0.6.3',
					'@exactjs/server': '0.6.3',
					'@exactjs/jsx': '0.6.1'
				}
			: {}
	);
	for (const runner of mixed ? ['vitest'] : ['vitest', 'bun-test']) {
		const root = path.join(temporary, runner);
		await mkdir(root);
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({
				name: `testing-${runner}`,
				private: true,
				type: 'module',
				dependencies: {
					'@exactjs/testing': '^0.6.0',
					'@exactjs/core': '^0.6.0',
					'@exactjs/jsx': '^0.6.0',
					[`@exactjs/${runner}`]: '^0.6.0',
					...(runner === 'vitest'
						? {
								vitest: '4.1.11',
								vite: '8.1.5',
								jsdom: '^25.0.1',
								esbuild: '0.27.2',
								'@exactjs/compiler': '^0.6.0',
								'@exactjs/server': '^0.6.0',
								'@exactjs/ssr': '^0.6.0'
							}
						: {})
				}
			})
		);
		await install(root);
		for (const name of ['testing', 'core', runner])
			assert.ok(
				(await realpath(path.join(root, 'node_modules/@exactjs', name))).startsWith(root + path.sep)
			);
		await cp(
			path.join(workspace, 'packages/testing/test-fixtures/documentation'),
			path.join(root, 'src'),
			{ recursive: true }
		);
		await rename(
			path.join(root, 'src/Counter.example.tsx'),
			path.join(root, 'src/Counter.test.tsx')
		);
		await writeFile(
			path.join(root, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					jsx: 'preserve',
					jsxImportSource: '@exactjs/jsx',
					strict: true
				}
			})
		);
		if (runner === 'vitest') {
			// Reuse the public paired journey against installed exports without workspace aliases.
			const paired = await readFile(
				path.join(workspace, 'packages/compiler/src/compilation/task-progress-testing.test.ts'),
				'utf8'
			);
			await writeFile(
				path.join(root, 'paired.test.ts'),
				paired
					.replace("from '../index.js'", "from '@exactjs/compiler'")
					.replace("from '../test-support/import-artifact.js'", "from './import-artifact.js'")
					.replace("from '../test-support/workspace.js'", "from './workspace.js'")
			);

			if (!mixed) {
				const ownership = await readFile(
					path.join(workspace, 'packages/compiler/src/compilation/continuation-ownership.test.ts'),
					'utf8'
				);
				await writeFile(
					path.join(root, 'ownership.test.ts'),
					ownership
						.replace("from '../index.js'", "from '@exactjs/compiler'")
						.replaceAll("from '../test-support/", "from './")
				);
				await cp(
					path.join(workspace, 'packages/compiler/src/test-support/ownership-journey-source.ts'),
					path.join(root, 'ownership-journey-source.ts')
				);
			}
			for (const helper of ['import-artifact', 'workspace']) {
				await cp(
					path.join(workspace, 'packages/compiler/src/test-support', helper + '.ts'),
					path.join(root, helper + '.ts')
				);
			}

			// The paired journey imports precompiled bundles. Only authored fixture source needs the plugin.
			await writeFile(
				path.join(root, 'vitest.config.ts'),
				`import {defineConfig} from 'vitest/config'; import {exactVitest} from '@exactjs/vitest'; export default defineConfig({plugins:[exactVitest({compiler:{exclude:/[.]exact-(?:progress-testing|ownership)-/}})],test:{environment:'jsdom'}});`
			);
			console.log(
				(await runAcceptanceCommand(['node_modules/vitest/vitest.mjs', 'run'], root)).stdout
			);
		} else {
			const test = path.join(root, 'src/Counter.test.tsx');
			await writeFile(
				test,
				(await readFile(test, 'utf8')).replace("from 'vitest'", "from 'bun:test'")
			);
			await writeFile(
				path.join(root, 'bunfig.toml'),
				'[test]\npreload = ["@exactjs/bun-test/preload"]\n'
			);
			const env = { ...process.env };
			delete env.EXACT_COMPILER_EXECUTABLE;
			delete env.NODE_PATH;
			try {
				const result = await promisify(execFile)('bun', ['--conditions=browser', 'test'], {
					cwd: root,
					env,
					maxBuffer: 16 * 1024 * 1024
				});
				console.log(result.stdout, result.stderr);
			} catch (error) {
				throw new Error(`Packed Bun testing failed\n${error.stdout}\n${error.stderr}`, {
					cause: error
				});
			}
		}
	}
} finally {
	await rm(temporary, { recursive: true, force: true });
}
