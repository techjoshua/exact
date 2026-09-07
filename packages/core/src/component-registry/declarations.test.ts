import { expect, it } from 'vitest';
import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

it('emits declarations for exported keys of an inferred lazy registry', () => {
	const filename = fileURLToPath(new URL('./declaration-consumer.ts', import.meta.url));
	const source = `
import { createComponentRegistry, type KeyOf } from '../index.js';
function Panel() { return () => null; }
const Pages = createComponentRegistry(({ lazy }) => ({ panel: lazy(async () => Panel) }));
export type PageKey = KeyOf<typeof Pages>;
`;
	const options: ts.CompilerOptions = {
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		declaration: true,
		emitDeclarationOnly: true,
		strict: true,
		skipLibCheck: true
	};
	const host = ts.createCompilerHost(options);
	const readFile = host.readFile.bind(host);
	host.readFile = (file) => (path.resolve(file) === filename ? source : readFile(file));
	const fileExists = host.fileExists.bind(host);
	host.fileExists = (file) => path.resolve(file) === filename || fileExists(file);
	const program = ts.createProgram([filename], options, host);
	let declaration = '';
	const result = program.emit(program.getSourceFile(filename), (_file, text) => {
		declaration = text;
	});
	expect(
		result.diagnostics.map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
		)
	).toEqual([]);
	expect(result.emitSkipped).toBe(false);
	expect(declaration).toContain('export type PageKey');
});
