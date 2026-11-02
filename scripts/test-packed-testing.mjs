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
	const compilerOnly = process.argv.includes('--compiler-only');
	assert.ok(!(mixed && compilerOnly), 'Choose one packed acceptance profile');
	const released = {
		'@exactjs/reactive': '0.6.2',
		'@exactjs/ssr': '0.6.3',
		'@exactjs/server': '0.6.3',
		'@exactjs/jsx': '0.6.1'
	};
	const install = await createPackedAppInstaller(workspace, temporary, mixed ? released : {});
	if (!mixed) await verifyPackedCompilerModules(install);
	if (mixed) {
		// The current provider floor excludes these frozen 0.6 releases. Verify rejection explicitly.
		// A positive mixed-version journey requires a compatible published provider.
		for (const [name, version] of Object.entries(released)) {
			const root = path.join(temporary, name.split('/')[1]);
			await mkdir(root);
			await writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({
					name: 'incompatible-release',
					private: true,
					dependencies: { [name]: '^0.8.0' }
				})
			);
			await assert.rejects(install(root), {
				message: `${name}@${version} does not satisfy ^0.8.0`
			});
			console.log(`Rejected incompatible dependency ${name}@${version} for ^0.8.0`);
		}
	}
	for (const runner of mixed || compilerOnly ? [] : ['vitest', 'bun-test']) {
		const root = path.join(temporary, runner);
		await mkdir(root);
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({
				name: `testing-${runner}`,
				private: true,
				type: 'module',
				dependencies: {
					'@exactjs/testing': '^0.8.0',
					'@exactjs/core': '^0.8.0',
					'@exactjs/jsx': '^0.8.0',
					[`@exactjs/${runner}`]: '^0.8.0',
					...(runner === 'vitest'
						? {
								vitest: '4.1.12',
								vite: '8.1.6',
								jsdom: '^25.0.1',
								esbuild: '0.27.2',
								'@exactjs/compiler': '^0.8.0',
								'@exactjs/server': '^0.8.0',
								'@exactjs/ssr': '^0.8.0'
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
		// Exercise the same retired-control contract through installed runner exports.
		await cp(
			path.join(workspace, 'packages/testing/src/test-support/retired-controls.fixtures.test.tsx'),
			path.join(root, 'src/RetiredControls.tsx')
		);
		await cp(
			path.join(
				workspace,
				'packages/component-composition-corpus/test-support/testing-control-lifetime-journey.ts'
			),
			path.join(root, 'src/control-lifetime-journey.ts')
		);
		for (const name of ['control-lifetime', 'context-preparation-cleanup', 'role-name']) {
			const source = await readFile(
				path.join(workspace, 'packages/testing/src', name + '.test.ts'),
				'utf8'
			);
			await writeFile(
				path.join(root, 'src', name + '.test.ts'),
				source
					.replace("from './index.js'", "from '@exactjs/testing'")
					.replace(
						"from './test-support/retired-controls.fixtures.test.js'",
						"from './RetiredControls.js'"
					)
					.replace(
						"from '../../component-composition-corpus/test-support/testing-control-lifetime-journey.js'",
						"from './control-lifetime-journey.js'"
					)
					.replace("from 'vitest'", runner === 'vitest' ? "from 'vitest'" : "from 'bun:test'")
			);
		}
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
				for (const [source, destination] of [
					['continuation-ownership', 'ownership'],
					['registry-hydration', 'registry-hydration']
				]) {
					const journey = await readFile(
						path.join(workspace, 'packages/compiler/src/compilation', source + '.test.ts'),
						'utf8'
					);
					await writeFile(
						path.join(root, destination + '.test.ts'),
						journey
							.replace("from '../index.js'", "from '@exactjs/compiler'")
							.replaceAll("from '../test-support/", "from './")
					);
				}
				await cp(
					path.join(workspace, 'packages/compiler/src/test-support/ownership-journey-source.ts'),
					path.join(root, 'ownership-journey-source.ts')
				);
			}
			for (const helper of ['import-artifact', 'workspace']) {
				const source = await readFile(
					path.join(workspace, 'packages/compiler/src/test-support', helper + '.ts'),
					'utf8'
				);
				// Installed journeys resolve compiler support through the published API,
				// never through implementation files absent from the isolated project.
				await writeFile(
					path.join(root, helper + '.ts'),
					source.replaceAll("'../artifacts.js'", "'@exactjs/compiler/adapter-support'")
				);
			}

			// Paired bundle queries need explicit test projections. Exclude their source roots
			// because the journeys already compile those artifacts themselves. Limit source
			// compilation to owned component fixtures so generated-source helpers remain ordinary code.
			await writeFile(
				path.join(root, 'vitest.config.ts'),
				`import { defineConfig } from 'vitest/config';
import { exactVitest } from '@exactjs/vitest';
export default defineConfig({
  plugins: [exactVitest({ compiler: {
    compileTestModules: true,
    include: /(?:Counter(?:[.]test)?|RetiredControls)[.]tsx$/,
    exclude: /[.]exact-(?:progress-testing|ownership|root-registry|island-registry|registry)-/
  } })],
  test: { environment: 'jsdom' }
});`
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

/** Installs only the SDK closure and runs its plain-module witness without framework providers. */
async function verifyPackedCompilerModules(install) {
	const root = path.join(temporary, 'compiler-modules');
	await mkdir(root);
	const compiler = JSON.parse(
		await readFile(path.join(workspace, 'packages/compiler/package.json'), 'utf8')
	);
	await writeFile(
		path.join(root, 'package.json'),
		JSON.stringify({
			name: 'packed-compiler-modules',
			private: true,
			type: 'module',
			dependencies: {
				'@exactjs/compiler': compiler.version,
				[`@exactjs/compiler-native-${process.platform}-${process.arch}`]: compiler.version
			}
		})
	);
	await install(root);
	// Inspect the installed closure, including transitive workspace packages, without a fixed inventory.
	const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
	for (const entry of Object.keys(lock.packages).filter((name) =>
		name.includes('node_modules/@exactjs/')
	)) {
		assert.ok((await realpath(path.join(root, entry))).startsWith(root + path.sep), entry);
	}
	await cp(
		path.join(workspace, 'scripts/compiler-confidence/installed-module-witness.mjs'),
		path.join(root, 'installed-module-witness.mjs')
	);
	await writeFile(
		path.join(root, 'run.mjs'),
		"import { verifyInstalledModuleWitness } from './installed-module-witness.mjs';\n" +
			'console.log(JSON.stringify(await verifyInstalledModuleWitness(process.cwd())));\n'
	);
	console.log((await runAcceptanceCommand(['run.mjs'], root)).stdout);
}
