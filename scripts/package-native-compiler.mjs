import { access, chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Stages one publishable native compiler package from a verified executable.
 *
 * Source templates remain private npm workspaces so every target can participate
 * in one lockfile on every development platform. The staged manifest removes
 * that workspace-only marker and adds npm's target restrictions.
 */
export async function stageNativeCompilerPackage({
	executable,
	license,
	platform,
	arch,
	root = repositoryRoot
}) {
	const target = `${platform}-${arch}`;
	const expectedName = `@exactjs/compiler-native-${target}`;
	await access(executable);
	await access(license);
	const templateRoot = path.join(root, 'native', 'npm', `compiler-native-${target}`);
	const templateManifest = JSON.parse(
		await readFile(path.join(templateRoot, 'package.json'), 'utf8')
	);
	if (
		templateManifest.name !== expectedName ||
		templateManifest.exactNativeTarget?.os !== platform ||
		templateManifest.exactNativeTarget?.cpu !== arch
	) {
		throw new Error(`Native compiler package metadata does not match target ${target}`);
	}
	const compilerManifest = JSON.parse(
		await readFile(path.join(root, 'packages', 'compiler', 'package.json'), 'utf8')
	);
	const packageRoot = path.join(root, '.tmp', 'native-packages', `compiler-native-${target}`);
	await rm(packageRoot, { recursive: true, force: true });
	await mkdir(packageRoot, { recursive: true });
	const {
		private: _private,
		exactNativeTarget: _exactNativeTarget,
		version: _templateVersion,
		...packageManifest
	} = templateManifest;
	await writeFile(
		path.join(packageRoot, 'package.json'),
		`${JSON.stringify(
			{
				...packageManifest,
				version: compilerManifest.version,
				os: [platform],
				cpu: [arch]
			},
			null,
			'\t'
		)}\n`
	);
	await cp(path.join(templateRoot, 'README.md'), path.join(packageRoot, 'README.md'));
	await cp(license, path.join(packageRoot, 'LICENSE.typescript-go'));
	const packageExecutable = path.join(packageRoot, platform === 'win32' ? 'exactc.exe' : 'exactc');
	await cp(executable, packageExecutable, { force: true });
	if (platform !== 'win32') await chmod(packageExecutable, 0o755);
	return packageRoot;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const executable = argument('executable');
	const license = argument('license');
	const platform = argument('platform') ?? process.platform;
	const arch = argument('arch') ?? process.arch;
	if (!executable) throw new Error('Pass --executable <exactc path>');
	if (!license) throw new Error('Pass --license <TypeScript-Go LICENSE path>');
	console.log(
		await stageNativeCompilerPackage({
			executable: path.resolve(executable),
			license: path.resolve(license),
			platform,
			arch
		})
	);
}

function argument(name) {
	const separate = process.argv.indexOf(`--${name}`);
	if (separate !== -1) return process.argv[separate + 1];
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
