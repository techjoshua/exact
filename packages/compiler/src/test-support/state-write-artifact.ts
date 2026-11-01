import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { createCompilerTestWorkspace } from './workspace.js';
import { importArtifact } from './import-artifact.js';

/** Compiles authored TSX mutation witnesses against workspace providers and owns compiler cleanup. */
export async function stateWriteArtifact(source: string, target: 'client' | 'server' | 'native') {
	const root = await createCompilerTestWorkspace('.exact-write-reference-', process.cwd());
	if (target === 'native') {
		const entry = path.join(root, 'native.ts');
		await writeFile(entry, source);
		return importArtifact(entry, path.join(root, 'native.mjs'));
	}
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const result = compiler.request({
		kind: 'compile',
		target,
		id: path.join(root, 'page.tsx'),
		root: process.cwd(),
		diagnostics: 'semantic',
		source
	});
	expect(result.error).toBeUndefined();
	expect(result.diagnostics).toEqual([]);
	const entry = path.join(root, 'page.ts');
	await writeFile(entry, result.code!);
	return importArtifact(entry, path.join(root, target + '.mjs'));
}
