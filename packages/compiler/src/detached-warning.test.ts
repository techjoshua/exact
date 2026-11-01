import { expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCompilerSession } from './expression/session.js';
import { resolveNativeCompilerExecutable } from './native/executable.js';
import { transformSource } from './compilation/transformation.js';
import { checkProject, collectProjectCheckDiagnostics } from './compilation/file-compilation.js';
import { compileFileArtifacts } from './compilation/artifact-compilation.js';
import { reportExactCompilerWarnings } from './compilation/build-diagnostics.js';
import { sourceDiagnostic } from './language-tools/source-diagnostics.js';
import { createCompilerTestWorkspace } from './test-support/workspace.js';

const source = `import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{}>){
 async function run(task:TaskContext=TaskContext.server().detached()){return 1;}
 return()=> <button onClick={()=>run()}>run</button>;
}`;

it.each(['client', 'server'] as const)(
	'retains structured definition warnings without inspection for %s',
	(target) => {
		const session = createCompilerSession({
			nativeCompiler: { executable: resolveNativeCompilerExecutable() }
		});
		try {
			const result = transformSource(source, {
				filename: path.resolve('detached-warning.tsx'),
				target,
				session,
				emitInspection: false,
				instrumentInspection: false
			});
			expect(result.inspectionCatalog).toBeUndefined();
			expect(result.diagnostics?.filter((d) => d.code === 'EXACT2004')).toMatchObject([
				{ severity: 'warning', line: 3 }
			]);
			expect(result.componentBuild.components).toHaveLength(1);
			expect(result.code).not.toBe('');
			const suppressed = transformSource(
				source.replace(' async function', ' /** @exact ignore=EXACT2004 */\n async function'),
				{ filename: path.resolve('detached-warning.tsx'), target, session }
			);
			expect(suppressed.diagnostics?.some((d) => d.code === 'EXACT2004')).toBe(false);
		} finally {
			session.dispose();
		}
	}
);

it('keeps the void checker silent while its single execution owner retains authored diagnostics', async () => {
	const root = await createCompilerTestWorkspace('detached-check-', path.resolve('.tmp'));
	const file = path.join(root, 'entry.tsx');
	await writeFile(file, source);
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		expect(await checkProject([file], { root })).toBeUndefined();
		expect(warn).not.toHaveBeenCalled();
		const diagnostics = await collectProjectCheckDiagnostics([file], { root });
		expect(diagnostics.filter((d) => d.code === 'EXACT2004')).toHaveLength(1);
		await writeFile(
			file,
			source
				.replace(' async function', ' /** @exact ignore=EXACT2004 */ async function')
				.replace('return 1;', 'const value: number = "bad";return value;')
		);
		await expect(checkProject([file], { root })).rejects.toThrow(/not assignable/);
	} finally {
		warn.mockRestore();
	}
});

it('preserves warnings independently on both artifact targets while the sink deduplicates only its invocation', async () => {
	const root = await createCompilerTestWorkspace('detached-artifacts-', path.resolve('.tmp'));
	const file = path.join(root, 'entry.tsx');
	await writeFile(file, source);
	const result = await compileFileArtifacts(file, { outDir: path.join(root, 'out') });
	for (const target of [result.client, result.server])
		expect(target.diagnostics?.filter((d) => d.code === 'EXACT2004')).toHaveLength(1);
	const warnings: string[] = [];
	reportExactCompilerWarnings(
		[...(result.client.diagnostics ?? []), ...(result.server.diagnostics ?? [])],
		(message) => warnings.push(message)
	);
	expect(warnings).toHaveLength(1);
	expect(warnings[0]).toContain('entry.tsx:3:');
	expect(warnings[0]).toContain('EXACT2004');
	reportExactCompilerWarnings(result.client.diagnostics ?? [], (message) => warnings.push(message));
	expect(warnings).toHaveLength(2);
});

it('uses exact structured warning identity and preserves severity and UTF-16 source projection', () => {
	const messages: string[] = [];
	const warning = {
		filename: 'page.tsx',
		code: 'EXACT2004',
		severity: 'warning' as const,
		message: 'SSR advisory',
		line: 2,
		column: 5
	};
	reportExactCompilerWarnings(
		[
			warning,
			warning,
			{ ...warning, column: 6 },
			{ ...warning, severity: 'error' },
			{ ...warning, code: 'EXACT2003' }
		],
		(message) => messages.push(message)
	);
	expect(messages).toHaveLength(3);
	const session = createCompilerSession({
		nativeCompiler: { executable: resolveNativeCompilerExecutable() }
	});
	try {
		const authored = '// 😀\n' + source;
		const response = session.compileNative({
			kind: 'analyze',
			id: path.resolve('unicode-detached.tsx'),
			source: authored,
			diagnostics: 'semantic'
		});
		const diagnostic = response.diagnostics.find((d) => d.code === 'EXACT2004');
		expect(diagnostic).toBeDefined();
		if (!diagnostic) throw new Error('Missing advisory');
		const projected = sourceDiagnostic(
			'unicode-detached.tsx',
			authored,
			diagnostic,
			response.analysis
		);
		expect(projected).toMatchObject({
			code: 'EXACT2004',
			severity: 'warning',
			range: {
				start: authored.indexOf('async function'),
				end: authored.indexOf('return 1;}') + 'return 1;}'.length
			}
		});
	} finally {
		session.dispose();
	}
});
