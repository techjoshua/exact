import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const packageRoots = [
	'agents',
	'packages',
	'framework-adapters',
	'react-adapters',
	'plugins',
	'component-libraries',
	'native/npm'
];
const integrationPackages = [
	'@exactjs/vite-plugin',
	'@exactjs/webpack-plugin',
	'@exactjs/bun-plugin'
];
const retiredCompilerPackages = new Set(['@exactjs/expressions', '@typescript/native']);
const retiredCompilerFiles =
	/^dist\/(?:analysis|annotations|component-computation|emission|policy|transform)(?:\/|\.)|^dist\/(?:annotations|assets|ast|calls|capabilities|component-contract-emission|continuations|descriptor-|exports|imports|module-rewrite|native-typescript|placement|platform-effects|preprocess|provenance|prune-imports|secret-transform|semantic|symbols)\./;
const packages = readWorkspacePackages();
const failures = [];

for (const packageName of integrationPackages) {
	for (const retiredPackage of retiredCompilerPackages) {
		const chain = dependencyChain(packageName, retiredPackage);
		if (chain) failures.push(`${chain.join(' -> ')} reaches the retired compiler`);
	}
}

const compiler = packages.get('@exactjs/compiler');
if (!compiler) failures.push('Cannot find @exactjs/compiler workspace manifest');
else {
	const nativePackages = Object.keys(compiler.optionalDependencies ?? {}).filter((name) =>
		name.startsWith('@exactjs/compiler-native-')
	);
	if (nativePackages.length !== 6) {
		failures.push(
			`@exactjs/compiler must declare exactly six platform optional dependencies; found ${nativePackages.length}`
		);
	}
	if (Object.keys(compiler.optionalDependencies ?? {}).length !== nativePackages.length) {
		failures.push(
			'@exactjs/compiler optionalDependencies must contain only native platform packages'
		);
	}
}

const packedFiles = await compilerPackedFiles();
for (const file of packedFiles) {
	if (retiredCompilerFiles.test(file))
		failures.push(`compiler tarball contains retired file ${file}`);
}

if (failures.length) {
	console.error('Compiler distribution validation failed:');
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}

console.log(
	`Compiler distribution is native-only (${packedFiles.length} host files; six platform-selected binary packages).`
);

/** Reads publishable workspace manifests by package name. */
function readWorkspacePackages() {
	const manifests = new Map();
	for (const directory of packageRoots) {
		const packageRoot = path.join(root, directory);
		if (!existsSync(packageRoot)) continue;
		for (const entry of readdirSync(packageRoot)) {
			const manifestPath = path.join(packageRoot, entry, 'package.json');
			if (!existsSync(manifestPath)) continue;
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			if (manifest.name) manifests.set(manifest.name, manifest);
		}
	}
	return manifests;
}

/** Finds a production dependency path between two workspace packages. */
function dependencyChain(from, target, visited = new Set()) {
	if (from === target) return [from];
	if (visited.has(from)) return undefined;
	visited.add(from);
	const manifest = packages.get(from);
	if (!manifest) return undefined;
	const dependencies = {
		...(manifest.dependencies ?? {}),
		...(manifest.optionalDependencies ?? {})
	};
	for (const dependency of Object.keys(dependencies)) {
		const tail = dependencyChain(dependency, target, new Set(visited));
		if (tail) return [from, ...tail];
	}
	return undefined;
}

/** Returns the exact path list npm would publish for the compiler host package. */
async function compilerPackedFiles() {
	const npmCommand = process.env.npm_execpath
		? { file: process.execPath, args: [process.env.npm_execpath] }
		: process.platform === 'win32'
			? { file: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd'] }
			: { file: 'npm', args: [] };
	const cacheDir = path.join(root, '.tmp', 'npm-cache');
	mkdirSync(cacheDir, { recursive: true });
	const { stdout } = await execFileAsync(
		npmCommand.file,
		[...npmCommand.args, 'pack', '--dry-run', '--json', '-w', '@exactjs/compiler'],
		{
			cwd: root,
			env: { ...process.env, npm_config_cache: cacheDir },
			encoding: 'utf8',
			windowsHide: true,
			maxBuffer: 10 * 1024 * 1024
		}
	);
	const [pack] = JSON.parse(stdout);
	return pack.files.map((file) => file.path);
}
