import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { expect, it, onTestFinished } from 'vitest';
import { resolveNativeCompilerExecutable } from './executable.js';

it.each([
	{ name: 'equals input mode', flags: ['--input-type=module'] },
	{ name: 'split input mode', flags: ['--input-type', 'module'] },
	{ name: 'equals input mode alias', flags: ['--input_type=module'] },
	{ name: 'split input mode alias', flags: ['--input_type', 'module'] },
	{ name: 'compatible runtime flags', flags: ['--trace-warnings'] }
])('starts and disposes the compiler worker with $name', async ({ flags }) => {
	const directory = await mkdtemp(path.join(tmpdir(), 'exact-worker-input-mode-'));
	onTestFinished(() => rm(directory, { recursive: true, force: true }));
	await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
	await build({
		entryPoints: {
			process: fileURLToPath(new URL('./process.ts', import.meta.url)),
			'process-worker': fileURLToPath(new URL('./process-worker.ts', import.meta.url))
		},
		outdir: directory,
		bundle: true,
		format: 'esm',
		platform: 'node'
	});
	const module = pathToFileURL(path.join(directory, 'process.js')).href;
	const executable = resolveNativeCompilerExecutable();
	const source = `import { NativeCompilerProcess } from ${JSON.stringify(module)};
const compiler = new NativeCompilerProcess({ executable: ${JSON.stringify(executable)}, timeoutMs: 1500, maxPayloadBytes: 1048576 });
try { if (compiler.request({ kind: 'version' }).protocolVersion) console.log('ready'); }
finally { compiler.dispose(); }`;
	const result = await promisify(execFile)(process.execPath, [...flags, '--eval', source], {
		timeout: 8000
	});
	expect(result.stdout.trim()).toBe('ready');
	expect(result.stderr).not.toContain('ERR_INPUT_TYPE_NOT_ALLOWED');
});
