import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import workerThreads from 'node:worker_threads';

/**
 * Runs inside an isolated packed consumer. Checks semantic paired emission and
 * browser/safe/browser replacement against one installed SDK session. The worker
 * boundary assertion binds execution to the installed optional platform package.
 */
export async function verifyInstalledModuleWitness(root) {
	const require = createRequire(path.join(root, 'package.json'));
	const executable = require.resolve(
		`@exactjs/compiler-native-${process.platform}-${process.arch}/${process.platform === 'win32' ? 'exactc.exe' : 'exactc'}`
	);
	const OriginalWorker = workerThreads.Worker;
	let selections = 0;
	workerThreads.Worker = class extends OriginalWorker {
		constructor(url, options) {
			if (options?.workerData?.executable) {
				assert.equal(options.workerData.executable, executable);
				selections++;
			}
			super(url, options);
		}
	};
	syncBuiltinESMExports();
	let session;
	try {
		const { compileProjectArtifacts, createCompilerSession } = await import('@exactjs/compiler');
		const { build } = await import('esbuild');
		session = createCompilerSession();
		const entry = path.join(root, 'entry.ts');
		const configFile = path.join(root, 'tsconfig.json');
		await writeFile(
			configFile,
			JSON.stringify({
				compilerOptions: {
					target: 'ES2022',
					module: 'NodeNext',
					moduleResolution: 'NodeNext',
					strict: true,
					lib: ['ESNext', 'DOM'],
					types: [],
					skipLibCheck: true
				},
				files: ['entry.ts']
			})
		);
		const outcomes = [];
		for (const browser of [true, false, true]) {
			const rhs = browser ? 'document.title' : '"safe replacement"';
			const source = `function make(input:{value:string}){return ()=>input.value}const input={value:"safe"};const xs=[make(input)];input.value=${rhs};export const value=xs[0]!();export const stable="stable";`;
			await writeFile(entry, source);
			const artifacts = await compileProjectArtifacts([entry], {
				root,
				rootDir: root,
				configFile,
				outDir: path.join(root, 'generated'),
				session,
				generatedValidation: 'semantic'
			});
			const artifact = artifacts.find((candidate) => candidate.inputFile === entry);
			assert.ok(artifact, 'missing paired entry artifact');
			for (const target of ['client', 'server']) {
				const file = artifact[target + 'File'];
				const code = await readFile(file, 'utf8');
				const bundled = await build({
					stdin: { contents: code, loader: 'ts', resolveDir: path.dirname(file) },
					write: false,
					bundle: true,
					platform: 'node',
					format: 'cjs',
					packages: 'external'
				});
				let gets = 0;
				const module = { exports: {} };
				const document = Object.defineProperty({}, 'title', {
					get() {
						gets++;
						return 'captured browser title';
					}
				});
				vm.runInNewContext(bundled.outputFiles[0].text, {
					module,
					exports: module.exports,
					require,
					document
				});
				assert.equal(module.exports.stable, 'stable');
				if (browser && target === 'server')
					assert.equal(Object.hasOwn(module.exports, 'value'), false);
				else
					assert.equal(
						module.exports.value,
						browser ? 'captured browser title' : 'safe replacement'
					);
				assert.equal(gets, browser && target === 'client' ? 1 : 0);
				outcomes.push({
					browser,
					target,
					gets,
					valuePresent: Object.hasOwn(module.exports, 'value')
				});
			}
		}
		assert.equal(selections, 1, 'source replacements must retain one native session');
		return { generatedValidation: 'semantic', selections, outcomes };
	} finally {
		session?.dispose();
		workerThreads.Worker = OriginalWorker;
		syncBuiltinESMExports();
	}
}
