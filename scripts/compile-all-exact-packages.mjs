import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exactCompileWorkspaces } from './exact-package-build-plan.mjs';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const compiler = path.join(repositoryRoot, 'scripts', 'compile-exact-package.mjs');

const failures = [];
for (const workspace of await exactCompileWorkspaces(repositoryRoot)) {
	const code = await run(process.execPath, [compiler, path.dirname(workspace.filename)]);
	if (code !== 0) failures.push(workspace.manifest.name);
}
if (failures.length) {
	throw new Error(`eXact package compilation failed for: ${failures.join(', ')}`);
}

function run(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd: repositoryRoot, stdio: 'inherit' });
		child.once('error', reject);
		child.once('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)));
	});
}
