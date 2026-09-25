import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNativeCompilerBuildKey } from './native-compiler-build-cache.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.tmp/native-artifact/island-mutations');
const overlay = path.join(root, 'native/typescript-go/overlay/internal/exactcompiler');
const execute = promisify(execFile);
// These deliberately broken implementations must compile, then fail observable hydration checks.
// Missing anchors fail closed when compiler refactoring requires updating a mutation.
const mutations = [
	{
		id: 'drop-dynamic-props',
		file: 'element_island_captures.go',
		before: 'if capture.propsEscape {',
		after: 'if false && capture.propsEscape {'
	},
	{
		id: 'replace-client-layout',
		file: 'element_islands.go',
		before: 'if island.serverSlot && !lowering.serverComponents {',
		after: 'if island.serverSlot {'
	},
	{
		id: 'misroute-computed-children',
		file: 'element_island_computed_props.go',
		before: 'lowering.clientIslandPropsRead(lowering.factory.NewIdentifier("props"), "children"),',
		after: 'lowering.factory.NewIdentifier("undefined"),'
	}
];
const sources = await Promise.all(
	mutations.map(async (mutation) => ({
		...mutation,
		source: await readFile(path.join(overlay, mutation.file), 'utf8')
	}))
);
const revision = JSON.parse(
	await readFile(path.join(root, 'native/typescript-go/upstream.json'), 'utf8')
).revision;
const sourceKey = await createNativeCompilerBuildKey({
	repositoryRoot: root,
	revision,
	target: `${process.platform}-${process.arch}`
});
const fingerprint = createHash('sha256')
	.update(sourceKey)
	.update(JSON.stringify(sources))
	.digest('hex');
const binaryName = (id) => id + (process.platform === 'win32' ? '.exe' : '');

if (process.argv[2] === '--build') {
	// The normal native build owns preparation of this pinned upstream checkout and overlay.
	const stage = path.join(root, '.tmp/native-typescript-go/tsc');
	assert.equal(
		(await execute('git', ['rev-parse', 'HEAD'], { cwd: stage })).stdout.trim(),
		revision,
		'Native stage uses the wrong upstream revision'
	);
	for (const relative of ['internal/exactcompiler', 'internal/compiler', 'cmd/exactc']) {
		const directory = path.join(root, 'native/typescript-go/overlay', relative);
		for (const entry of await readdir(directory, { recursive: true })) {
			if (!entry.endsWith('.go')) continue;
			assert.equal(
				await readFile(path.join(stage, relative, entry), 'utf8'),
				await readFile(path.join(directory, entry), 'utf8'),
				'Native stage is stale; run build:native-compiler'
			);
		}
	}
	await mkdir(output, { recursive: true });
	const temporary = await mkdtemp(path.join(output, 'overlay-'));
	try {
		for (const mutation of sources) {
			const original = path.join(stage, 'internal/exactcompiler', mutation.file);
			assert.equal(
				await readFile(original, 'utf8'),
				mutation.source,
				'Run build:native-compiler before building mutations'
			);
			assert.equal(
				mutation.source.split(mutation.before).length,
				2,
				`${mutation.id}: expected one mutation anchor`
			);
			const replacement = path.join(temporary, mutation.file);
			await writeFile(replacement, mutation.source.replace(mutation.before, mutation.after));
			const mapping = path.join(temporary, 'overlay.json');
			await writeFile(mapping, JSON.stringify({ Replace: { [original]: replacement } }));
			await execute(
				process.env.EXACT_GO || 'go',
				[
					'build',
					'-buildvcs=false',
					'-trimpath',
					'-overlay',
					mapping,
					'-o',
					path.join(output, binaryName(mutation.id)),
					'./cmd/exactc'
				],
				{
					cwd: stage,
					timeout: 180_000,
					maxBuffer: 4 * 1024 * 1024,
					env: {
						...process.env,
						CGO_ENABLED: '0',
						GOOS: process.platform === 'win32' ? 'windows' : process.platform,
						GOARCH: process.arch === 'x64' ? 'amd64' : process.arch
					}
				}
			);
			console.log(`Built mutation: ${mutation.id}`);
		}
		await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ fingerprint }));
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
} else if (process.argv[2] === '--verify') {
	assert.equal(
		JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8')).fingerprint,
		fingerprint,
		'Mutation artifacts are stale'
	);
	const args = [
		'node_modules/vitest/vitest.mjs',
		'run',
		'framework-adapters/vite-plugin/src/motion-ssr.integration.test.ts',
		'-t',
		'wrapper-intrinsic-shell\\)$'
	];
	const options = { cwd: root, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 };
	await execute(process.execPath, args, options);
	console.log('Unmodified compiler passes the mutation witness');
	for (const mutation of mutations) {
		if (process.platform !== 'win32')
			await chmod(path.join(output, binaryName(mutation.id)), 0o755);
		let failure;
		try {
			await execute(process.execPath, args, {
				...options,
				env: {
					...process.env,
					EXACT_COMPILER_EXECUTABLE: path.join(output, binaryName(mutation.id))
				}
			});
		} catch (error) {
			failure = error;
		}
		assert.ok(failure, `Surviving mutation: ${mutation.id}`);
		assert.equal(failure.killed, false, `${mutation.id}: a timeout is not a detected mutation`);
		assert.match(
			`${failure.stdout}\n${failure.stderr}`,
			/AssertionError \[ERR_ASSERTION\]/,
			`${mutation.id}: must fail behavioral assertions, not compilation or startup`
		);
		assert.match(
			`${failure.stdout}\n${failure.stderr}`,
			/at (?:captureIslandSemantics|verifyIslandSemantics|verifySemanticReads|file:\/\/[^\n]*\/verify-motion-hydration\.mjs:)/,
			`${mutation.id}: assertion must originate in the behavioral verifier`
		);
		console.log(`Detected mutation: ${mutation.id}`);
	}
} else {
	throw new Error('Usage: node scripts/check-island-mutations.mjs --build|--verify');
}
