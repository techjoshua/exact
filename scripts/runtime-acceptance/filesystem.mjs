import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Verifies filesystem providers, package provenance, wide catalogs and compiler projections on native tooling hosts. */
export async function checkNativeFilesystemContracts(root, temporary) {
	const { NativeCompilerLanguageClient, resolveNativeCompilerExecutable } = await import(
		'@exactjs/compiler'
	);
	const { compilerObservationSource } = await import(
		pathToFileURL(
			path.join(
				root,
				'packages/component-composition-corpus/test-support/compiler-observation-journey.mjs'
			)
		).href
	);
	const client = new NativeCompilerLanguageClient();
	const fixturePath = path.join(temporary, 'compiler-observation.json');
	try {
		const fixtures = [];
		for (const eager of [false, true]) {
			const filename = path.join(
				temporary,
				eager ? 'EagerCompilerObservation.tsx' : 'CompilerObservation.tsx'
			);
			const source = eager
				? compilerObservationSource
						.replace('TaskContext,', 'onUnmount, TaskContext,')
						.replace(' this.state.count = 1;', ' onUnmount(() => {});\n this.state.count = 1;')
				: compilerObservationSource;
			const response = await client.request({
				kind: 'analyze',
				id: filename,
				source,
				root,
				diagnostics: 'semantic'
			});
			fixtures.push({ filename, source, response });
		}
		await writeFile(fixturePath, JSON.stringify(fixtures));
	} finally {
		await client.dispose();
	}
	const output = path.join(temporary, 'filesystem-contracts.mjs');
	await build({
		entryPoints: [
			path.join(
				root,
				'packages/component-composition-corpus/test-support/runtime-acceptance/filesystem.mjs'
			)
		],
		outfile: output,
		platform: 'node',
		format: 'esm',
		bundle: true,
		external: ['node:*'],
		target: 'es2022'
	});
	const deno = createRequire(import.meta.url)('deno/install_api.cjs').runInstall();
	const executions = [];
	for (const [runtime, executable, flags] of [
		['node', process.execPath, []],
		['bun', process.env.BUN_EXECUTABLE ?? 'bun', []],
		[
			'deno',
			deno,
			[
				'run',
				'--no-config',
				'--no-lock',
				'--cached-only',
				'--allow-read',
				'--allow-write',
				'--allow-env'
			]
		]
	]) {
		await promisify(execFile)(
			executable,
			[...flags, output, path.join(temporary, 'provider-files-' + runtime), fixturePath],
			{
				cwd: root,
				timeout: 30_000,
				maxBuffer: 64 * 1024
			}
		);
		if (runtime !== 'deno')
			await promisify(execFile)(
				executable,
				[
					path.join(
						root,
						'packages/component-composition-corpus/test-support/runtime-acceptance/compiler-session.mjs'
					)
				],
				{
					cwd: root,
					env: { ...process.env, EXACT_COMPILER_EXECUTABLE: resolveNativeCompilerExecutable() },
					timeout: 30_000,
					maxBuffer: 64 * 1024
				}
			);
		executions.push({
			id: 'native-filesystem-' + runtime,
			tests: [
				'environment-file-values',
				'environment-file-cancellation',
				'empty-secret-values',
				'environment-name-dictionary',
				'provider-observation-aliases',
				'provider-context-and-signal-ownership',
				'package-export-physical-containment',
				'wide-catalog-file-loading',
				'compiler-native-fact-projection-observations',
				'compiler-build-observation-values',
				...(runtime === 'deno' ? [] : ['compiler-session-observation-ownership'])
			],
			status: 'verified'
		});
		console.log(runtime + ': provider files, package containment and wide catalog controls passed');
	}
	return executions;
}
