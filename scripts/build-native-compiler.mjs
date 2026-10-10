import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { checkoutNativeTypeScriptGo } from './checkout-native-typescript-go.mjs';
import {
	createNativeCompilerBuildKey,
	isNativeCompilerBuildCurrent,
	writeNativeCompilerBuildStamp
} from './native-compiler-build-cache.mjs';
import { prepareNativeCompilerSource } from './native-compiler-source.mjs';
import { stageNativeCompilerPackage } from './package-native-compiler.mjs';
import { summarizeNativeCoverage } from './compiler-confidence/coverage.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nativeRoot = path.join(repositoryRoot, 'native', 'typescript-go');
const upstream = JSON.parse(await readFile(path.join(nativeRoot, 'upstream.json'), 'utf8'));
const source = await prepareNativeCompilerSource({
	explicitSource: argument('source') ?? process.env.EXACT_TYPESCRIPT_GO_SOURCE,
	repositoryRoot,
	checkout: checkoutNativeTypeScriptGo
});
const targetPlatform = argument('platform') ?? process.platform;
const targetArch = argument('arch') ?? process.arch;
const packageOutput = process.argv.includes('--package');
const collectCoverage = process.argv.includes('--coverage');
const allTargets = process.argv.includes('--all-targets');
if (allTargets && (!packageOutput || collectCoverage || argument('platform') || argument('arch'))) {
	throw new Error('--all-targets requires --package and cannot select coverage or one target');
}
const forceBuild = process.argv.includes('--force') || collectCoverage;
const supportedTargets = new Set([
	'darwin-arm64',
	'darwin-x64',
	'linux-arm64',
	'linux-x64',
	'win32-arm64',
	'win32-x64'
]);
const target = `${targetPlatform}-${targetArch}`;

if (!supportedTargets.has(target)) throw new Error(`Unsupported native compiler target ${target}`);

const sourceRoot = path.resolve(source);
const revision = (await run('git', ['rev-parse', 'HEAD'], sourceRoot)).trim();
if (revision !== upstream.revision) {
	throw new Error(`TypeScript checkout is ${revision}; expected ${upstream.revision}`);
}
const outputDirectory = path.join(repositoryRoot, '.tmp', 'native-compiler');
await mkdir(outputDirectory, { recursive: true });
const executable = path.join(outputDirectory, targetPlatform === 'win32' ? 'exactc.exe' : 'exactc');
const stampFile = path.join(outputDirectory, `${target}.build.json`);
const buildKey = await createNativeCompilerBuildKey({
	repositoryRoot,
	revision,
	target
});
const current = await isNativeCompilerBuildCurrent({
	executable,
	stampFile,
	buildKey,
	bypassCache: forceBuild || packageOutput || allTargets
});
if (current) {
	console.log(`Native compiler is current: ${executable}`);
} else {
	// Semantic source witnesses resolve published runtime and enhancement declarations.
	// Build them before native tests so a clean checkout has the same inputs as a warm one.
	await run(
		process.execPath,
		[
			path.join(repositoryRoot, 'node_modules/typescript/bin/tsc6'),
			'-b',
			'packages/core',
			'packages/jsx-runtime',
			'packages/dom',
			'packages/ssr',
			'packages/hydrate',
			'packages/intl',
			'packages/time',
			'plugins/secrets'
		],
		repositoryRoot,
		true
	);
	const stageRoot = path.join(repositoryRoot, '.tmp', 'native-typescript-go');
	await rm(stageRoot, { recursive: true, force: true });
	await mkdir(path.dirname(stageRoot), { recursive: true });
	await run('git', ['worktree', 'prune'], sourceRoot);
	await run(
		'git',
		['worktree', 'add', '--detach', '--no-checkout', stageRoot, upstream.revision],
		sourceRoot,
		true
	);
	// The upstream test corpus is not needed to compile or test the eXact overlay.
	await run('git', ['sparse-checkout', 'set', 'tsc/internal', 'tsc/cmd', 'tools'], stageRoot, true);
	await run('git', ['read-tree', '-mu', 'HEAD'], stageRoot, true);
	const compilerRoot = path.join(stageRoot, 'tsc');

	const overlayRoot = path.join(nativeRoot, 'overlay');
	for (const relative of [
		'internal/exactcompiler',
		'internal/compiler',
		'internal/checker',
		'cmd/exactc'
	]) {
		await cp(path.join(overlayRoot, relative), path.join(compilerRoot, relative), {
			recursive: true,
			force: true
		});
	}

	for (const patch of [
		'internal/compiler/program.patch',
		'internal/printer/optional_chain.patch'
	]) {
		await run(
			'git',
			['apply', '--ignore-space-change', path.join(overlayRoot, patch)],
			stageRoot,
			true
		);
	}

	const go = process.env.EXACT_GO || 'go';
	const coverageDirectory = path.join(repositoryRoot, '.tmp/compiler-confidence/native');
	const coverageFile = path.join(coverageDirectory, 'statements.out');
	if (collectCoverage) {
		await rm(coverageDirectory, { recursive: true, force: true });
		await mkdir(coverageDirectory, { recursive: true });
	}
	await run(
		go,
		[
			'test',
			...(collectCoverage ? ['-count=1', '-covermode=count', `-coverprofile=${coverageFile}`] : []),
			'./internal/exactcompiler',
			'./cmd/exactc'
		],
		compilerRoot,
		true
	);
	if (collectCoverage) {
		const summary = summarizeNativeCoverage(await readFile(coverageFile, 'utf8'));
		await writeFile(
			path.join(coverageDirectory, 'statements.json'),
			JSON.stringify(summary, null, 2) + '\n'
		);
		await writeFile(
			path.join(coverageDirectory, 'functions.txt'),
			await run(go, ['tool', 'cover', `-func=${coverageFile}`], compilerRoot)
		);
		console.log(
			`Native statement coverage: ${summary.covered}/${summary.statements} (${summary.percent.toFixed(1)}%)`
		);
		await run(
			go,
			[
				'tool',
				'cover',
				`-html=${coverageFile}`,
				'-o',
				path.join(coverageDirectory, 'statements.html')
			],
			compilerRoot,
			true
		);
	}
	// One immutable staged source and one host validation serve every release target.
	for (const buildTarget of allTargets ? supportedTargets : [target]) {
		const [platform, arch] = buildTarget.split('-');
		const executable = path.join(outputDirectory, platform === 'win32' ? 'exactc.exe' : 'exactc');
		await run(
			go,
			['build', '-buildvcs=false', '-trimpath', '-o', executable, './cmd/exactc'],
			compilerRoot,
			true,
			{
				...process.env,
				CGO_ENABLED: '0',
				GOOS: platform === 'win32' ? 'windows' : platform,
				GOARCH: arch === 'x64' ? 'amd64' : arch
			}
		);
		if (platform !== 'win32') await chmod(executable, 0o755);
		await writeNativeCompilerBuildStamp(
			path.join(outputDirectory, `${buildTarget}.build.json`),
			await createNativeCompilerBuildKey({ repositoryRoot, revision, target: buildTarget }),
			executable
		);
		if (packageOutput) {
			console.log(
				await stageNativeCompilerPackage({
					executable,
					license: path.join(stageRoot, 'LICENSE.txt'),
					notice: path.join(stageRoot, 'NOTICE.txt'),
					platform,
					arch
				})
			);
		}
	}
}
console.log(executable);

function argument(name) {
	const separate = process.argv.indexOf(`--${name}`);
	if (separate !== -1) return process.argv[separate + 1];
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function run(command, args, cwd, inherit = false, env = process.env) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env,
			stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
			windowsHide: true
		});
		let stdout = '';
		let stderr = '';
		if (!inherit) {
			child.stdout.setEncoding('utf8');
			child.stderr.setEncoding('utf8');
			child.stdout.on('data', (chunk) => (stdout += chunk));
			child.stderr.on('data', (chunk) => (stderr += chunk));
		}
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) resolve(stdout);
			else reject(new Error(`${command} exited with ${code}${stderr ? `\n${stderr}` : ''}`));
		});
	});
}
