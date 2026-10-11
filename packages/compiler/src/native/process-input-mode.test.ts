import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
	{ name: 'compatible runtime flags', flags: ['--trace-warnings'] },
	{ name: 'provider heap limit', flags: ['--max-old-space-size=256'] },
	{ name: 'young-generation limit', flags: ['--max-semi-space-size=8'] },
	{ name: 'provider heap alias', flags: ['--max_old_space_size=256'] },
	{
		name: 'heap limit with input mode',
		flags: ['--max-old-space-size=256', '--input-type=module']
	},
	{ name: 'V8 garbage collection capability', flags: ['--expose-gc'] },
	{
		name: 'inherited module preload',
		flags: ['--import=data:text/javascript,globalThis.__exactWorkerFlag%3D%22loaded%22']
	},
	{ name: 'custom resolution condition', flags: ['--conditions=exact-worker-test'] },
	{ name: 'environment heap limit', flags: [], nodeOptions: '--max-old-space-size=256' }
])('starts and disposes the compiler worker with $name', async ({ flags, ...options }) => {
	const directory = await mkdtemp(path.join(tmpdir(), 'exact-worker-input-mode-'));
	onTestFinished(() => rm(directory, { recursive: true, force: true }));
	await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
	const heapFile = path.join(directory, 'worker-heap.json');
	await build({
		entryPoints: {
			process: fileURLToPath(new URL('./process.ts', import.meta.url)),
			'process-worker': fileURLToPath(new URL('./process-worker.ts', import.meta.url))
		},
		outdir: directory,
		bundle: true,
		format: 'esm',
		platform: 'node',
		banner: {
			js: `import {isMainThread} from 'node:worker_threads';import {getHeapStatistics} from 'node:v8';import {writeFileSync} from 'node:fs';if(!isMainThread)writeFileSync(${JSON.stringify(heapFile)},JSON.stringify({heap:getHeapStatistics().heap_size_limit,gc:typeof globalThis.gc,preload:globalThis.__exactWorkerFlag,conditions:process.execArgv.filter(flag=>flag.startsWith('--conditions='))}));`
		}
	});
	const module = pathToFileURL(path.join(directory, 'process.js')).href;
	const executable = resolveNativeCompilerExecutable();
	const source = `import {getHeapStatistics} from 'node:v8';import { NativeCompilerProcess } from ${JSON.stringify(module)};
const compiler = new NativeCompilerProcess({ executable: ${JSON.stringify(executable)}, timeoutMs: 1500, maxPayloadBytes: 1048576 });
try { if (compiler.request({ kind: 'version' }).protocolVersion) console.log(JSON.stringify({ready:true,heap:getHeapStatistics().heap_size_limit,gc:typeof globalThis.gc,preload:globalThis.__exactWorkerFlag,conditions:process.execArgv.filter(flag=>flag.startsWith('--conditions='))})); }
finally { compiler.dispose(); }`;
	const result = await promisify(execFile)(process.execPath, [...flags, '--eval', source], {
		timeout: 8000,
		env: {
			...process.env,
			NODE_OPTIONS: 'nodeOptions' in options ? options.nodeOptions : process.env.NODE_OPTIONS
		}
	});
	const parent = JSON.parse(result.stdout.trim());
	const child = JSON.parse(await readFile(heapFile, 'utf8'));
	expect(parent.ready).toBe(true);
	expect(child).toEqual({
		heap: parent.heap,
		gc: parent.gc,
		preload: parent.preload,
		conditions: parent.conditions
	});
	expect(result.stderr).not.toContain('ERR_INPUT_TYPE_NOT_ALLOWED');
});
