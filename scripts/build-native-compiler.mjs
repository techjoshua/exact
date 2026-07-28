import { chmod, cp, mkdir, readFile, rm } from 'node:fs/promises';
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
const goTargetPlatform = targetPlatform === 'win32' ? 'windows' : targetPlatform;
const goTargetArch = targetArch === 'x64' ? 'amd64' : targetArch;
const packageOutput = process.argv.includes('--package');
const forceBuild = process.argv.includes('--force');
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
	throw new Error(`TypeScript-Go checkout is ${revision}; expected ${upstream.revision}`);
}
const outputDirectory = path.join(repositoryRoot, '.tmp', 'native-compiler');
await mkdir(outputDirectory, { recursive: true });
const executable = path.join(
	outputDirectory,
	targetPlatform === 'win32' ? 'exactc-native.exe' : 'exactc-native'
);
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
	bypassCache: forceBuild || packageOutput
});
if (current) {
	console.log(`Native compiler is current: ${executable}`);
} else {
	const stageRoot = path.join(repositoryRoot, '.tmp', 'native-typescript-go');
	await rm(stageRoot, { recursive: true, force: true });
	await mkdir(path.dirname(stageRoot), { recursive: true });
	await run('git', ['worktree', 'prune'], sourceRoot);
	await run('git', ['worktree', 'add', '--detach', stageRoot, upstream.revision], sourceRoot, true);

	const overlayRoot = path.join(nativeRoot, 'overlay');
	for (const relative of ['internal/exactcompiler', 'cmd/exactc-native']) {
		await cp(path.join(overlayRoot, relative), path.join(stageRoot, relative), {
			recursive: true,
			force: true
		});
	}

	const go = process.env.EXACT_GO || 'go';
	await run(go, ['test', './internal/exactcompiler', './cmd/exactc-native'], stageRoot, true);
	await run(
		go,
		['build', '-buildvcs=false', '-trimpath', '-o', executable, './cmd/exactc-native'],
		stageRoot,
		true,
		{
			...process.env,
			CGO_ENABLED: '0',
			GOOS: goTargetPlatform,
			GOARCH: goTargetArch
		}
	);
	if (targetPlatform !== 'win32') await chmod(executable, 0o755);
	await writeNativeCompilerBuildStamp(stampFile, buildKey, executable);
	if (packageOutput) {
		console.log(
			await stageNativeCompilerPackage({
				executable,
				license: path.join(stageRoot, 'LICENSE'),
				platform: targetPlatform,
				arch: targetArch
			})
		);
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
