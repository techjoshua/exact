import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const docsRoot = resolve(import.meta.dirname, '..');
const playwrightCli = resolve(docsRoot, '../../node_modules/@playwright/test/cli.js');
const server = await createServer({
	root: docsRoot,
	server: { host: '127.0.0.1', port: 4176, strictPort: true }
});

let result;
try {
	// Owning Vite in this process gives Windows a deterministic shutdown boundary after Playwright.
	await server.listen();
	result = await runPlaywright(process.argv.slice(2));
} finally {
	await server.close();
}

if (result.signal) {
	console.error(`Playwright terminated from ${result.signal}.`);
	process.exitCode = 1;
} else {
	process.exitCode = result.code ?? 1;
}

/** Runs the browser worker while the caller retains ownership of the in-process Vite server. */
function runPlaywright(arguments_) {
	return new Promise((resolveResult, reject) => {
		const child = spawn(process.execPath, [playwrightCli, 'test', ...arguments_], {
			cwd: docsRoot,
			stdio: 'inherit',
			env: { ...process.env, THEME_LAB_MANAGED_SERVER: '1' }
		});
		child.once('error', reject);
		child.once('exit', (code, signal) => resolveResult({ code, signal }));
	});
}
