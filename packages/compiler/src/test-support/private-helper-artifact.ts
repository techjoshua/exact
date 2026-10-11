import path from 'node:path';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { expect, onTestFinished } from 'vitest';
import type { createPendingReactiveTransaction } from '@exactjs/reactive/framework/transactions';
import type { reactive } from '@exactjs/reactive';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { importArtifact } from './import-artifact.js';

/** Loads authored and compiled controls against the same installed helper registry and runtime. */
export async function privateHelperArtifact(source: string, target: 'client' | 'server') {
	const parent = path.resolve('.tmp/task-private-routing');
	await mkdir(parent, { recursive: true });
	const directory = await mkdtemp(path.join(parent, 'probe-'));
	onTestFinished(() => rm(directory, { recursive: true, force: true }));
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const file = path.join(directory, 'helper.ts');
	const result = compiler.request({
		kind: 'compile',
		target,
		root: process.cwd(),
		id: file,
		diagnostics: 'semantic',
		source
	});
	expect(result.error).toBeUndefined();
	expect(result.diagnostics).toEqual([]);
	await writeFile(file, result.code!);
	const authored = path.join(directory, 'authored.ts');
	await writeFile(authored, source);
	const provider = path.join(directory, 'provider.ts');
	await writeFile(
		provider,
		"export {createPendingReactiveTransaction} from '@exactjs/reactive/framework/transactions';export {reactive} from '@exactjs/reactive';"
	);
	return {
		compiled: await importArtifact(file, path.join(directory, 'helper.mjs')),
		authored: await importArtifact(authored, path.join(directory, 'authored.mjs')),
		runtime: (await importArtifact(provider, path.join(directory, 'provider.mjs'))) as {
			createPendingReactiveTransaction: typeof createPendingReactiveTransaction;
			reactive: typeof reactive;
		}
	};
}
