import path from 'node:path';
import ts from 'typescript';
import type { ExpressionDiagnostic } from '../model.js';
import type { ExpressionLanguageServiceUpdate } from './contracts.js';

export function freezeUpdate(
	generation: number,
	changedFiles: readonly string[],
	affectedFiles: readonly string[],
	diagnostics: readonly ExpressionDiagnostic[]
): ExpressionLanguageServiceUpdate {
	return Object.freeze({
		generation,
		changedFiles: Object.freeze([...changedFiles]),
		affectedFiles: Object.freeze([...affectedFiles]),
		diagnostics: Object.freeze([...diagnostics])
	});
}

export function uniqueDiagnostics(
	diagnostics: readonly ExpressionDiagnostic[]
): ExpressionDiagnostic[] {
	const seen = new Set<string>();
	return diagnostics.filter((diagnostic) => {
		const key = `${diagnostic.filename}:${diagnostic.code}:${diagnostic.span?.start}:${diagnostic.message}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function diagnosticFromTs(
	diagnostic: ts.Diagnostic,
	phase: ExpressionDiagnostic['phase']
): ExpressionDiagnostic {
	const source = diagnostic.file;
	const start = diagnostic.start;
	const location =
		source && start !== undefined ? source.getLineAndCharacterOfPosition(start) : undefined;
	return {
		code: `TS${diagnostic.code}`,
		message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
		severity: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
		phase,
		filename: source ? displayFile(source.fileName) : undefined,
		span:
			start === undefined || !location
				? undefined
				: {
						start,
						end: start + (diagnostic.length ?? 0),
						line: location.line + 1,
						column: location.character + 1
					}
	};
}

export function isConfigurationDependency(filename: string): boolean {
	return /(?:^|[\\/])(?:tsconfig(?:\.[^\\/]+)?\.json|package\.json)$/i.test(filename);
}

export function isScript(filename: string): boolean {
	return /\.[cm]?[jt]sx?$/i.test(filename);
}

export function isTsx(filename: string): boolean {
	return /\.[cm]?[jt]sx$/i.test(filename);
}

export function displayFile(filename: string): string {
	return path.resolve(filename).replaceAll('\\', '/');
}

export function canonicalFile(filename: string): string {
	const displayed = displayFile(filename);
	return ts.sys.useCaseSensitiveFileNames ? displayed : displayed.toLowerCase();
}

export function hash(value: string): string {
	return ts.sys.createHash?.(value) ?? String(value.length);
}
