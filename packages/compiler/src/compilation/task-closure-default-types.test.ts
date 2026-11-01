import { readFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { createTestWorkspace, writeTestFiles, repositoryPath } from '../test-support/workspace.js';

for (const origin of ['user', 'imported'] as const)
	it(`retains authored ${origin} unknown default assignment errors in ordinary task closures`, async () => {
		const root = await createTestWorkspace('.exact-closure-default-types-', process.cwd());
		const original = await readFile(
			repositoryPath(
				'packages/component-composition-corpus/test-support/task-closures/function-default.tsx'
			),
			'utf8'
		);
		const prefix =
			origin === 'user'
				? 'declare const unknownInput:unknown;\n'
				: "import {unknownInput} from './unknown-input.js';\n";
		const source = prefix + original.replace('owner.state.n += 1', 'owner.state.n = unknownInput');
		expect(source).not.toContain('owner.state.n += 1');
		const files = await writeTestFiles(root, {
			'page.tsx': source,
			'unknown-input.ts': 'export const unknownInput:unknown=1;',
			'tsconfig.json': JSON.stringify({
				compilerOptions: {
					target: 'ES2022',
					module: 'NodeNext',
					moduleResolution: 'NodeNext',
					lib: ['ESNext', 'DOM'],
					jsx: 'preserve',
					strict: true,
					skipLibCheck: true
				},
				files: ['page.tsx']
			})
		});
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		for (const target of ['default', 'client', 'server'] as const) {
			const response = compiler.request({
				kind: target === 'default' ? 'check' : 'compile',
				id: files['page.tsx']!,
				root,
				source,
				configFile: files['tsconfig.json'],
				target,
				diagnostics: 'semantic'
			});
			expect(response.error).toBeUndefined();
			expect(
				response.diagnostics?.some(
					(diagnostic) =>
						diagnostic.code === 'TS2322' &&
						diagnostic.message.includes("Type 'unknown' is not assignable to type 'number'")
				)
			).toBe(true);
		}
	});
