import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const packageRoots = [
	'agents',
	'packages',
	'framework-adapters',
	'react-adapters',
	'plugins',
	'component-libraries',
	'native/npm'
].map((directory) => path.join(root, directory));
const npmCommand = process.env.npm_execpath
	? { file: process.execPath, args: [process.env.npm_execpath] }
	: { file: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: [] };
const cacheDir = path.join(root, '.tmp', 'npm-cache');
const disallowedPath = /(^src\/|\.test\.|tsconfig|tsbuildinfo)/;
const concurrency = Math.max(1, Number.parseInt(process.env.EXACT_PACK_WORKERS ?? '4', 10));

mkdirSync(cacheDir, { recursive: true });

const packages = [];
for (const packageRoot of packageRoots) {
	if (!existsSync(packageRoot)) continue;
	for (const directory of readdirSync(packageRoot)) {
		const packageJsonPath = path.join(packageRoot, directory, 'package.json');
		if (!existsSync(packageJsonPath)) continue;
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
		if (!packageJson.private) packages.push(packageJson.name);
	}
}

const results = new Array(packages.length);
let cursor = 0;
await Promise.all(
	Array.from({ length: Math.min(concurrency, packages.length) }, async () => {
		while (cursor < packages.length) {
			const index = cursor++;
			results[index] = await inspectPackage(packages[index]);
		}
	})
);

let failed = false;
for (const result of results) {
	if (result.badFiles.length) {
		failed = true;
		console.error(`${result.name} has disallowed package files:`);
		for (const file of result.badFiles) console.error(`  ${file}`);
	} else {
		console.log(`${result.name} package files ok (${result.entryCount} entries)`);
	}
}
if (failed) process.exit(1);

async function inspectPackage(name) {
	const { stdout } = await execFileAsync(
		npmCommand.file,
		[...npmCommand.args, 'pack', '--dry-run', '--json', '-w', name],
		{
			cwd: root,
			env: { ...process.env, npm_config_cache: cacheDir },
			encoding: 'utf8',
			windowsHide: true,
			maxBuffer: 10 * 1024 * 1024
		}
	);
	const [pack] = JSON.parse(stdout);
	return {
		name,
		entryCount: pack.entryCount,
		badFiles: pack.files.map((file) => file.path).filter((file) => disallowedPath.test(file))
	};
}
