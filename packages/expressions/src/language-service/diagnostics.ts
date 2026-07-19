import ts from 'typescript';
import type { ExpressionDiagnostic } from '../model.js';
import { canonicalFile, diagnosticFromTs, uniqueDiagnostics } from './utilities.js';

export type LanguageServiceDiagnosticContext = {
	service: ts.LanguageService;
	compilerOptions: ts.CompilerOptions;
	deleted: ReadonlySet<string>;
	readFile(filename: string): string | undefined;
	preferredFilename(filename: string): string;
	recordPasses(count: number): void;
};

/** Collects syntax and semantic diagnostics for an explicit affected-file set. */
export function diagnosticsForFiles(
	filenames: readonly string[],
	context: LanguageServiceDiagnosticContext
): ExpressionDiagnostic[] {
	const diagnostics: ExpressionDiagnostic[] = [];
	for (const filename of filenames) {
		if (context.deleted.has(canonicalFile(filename))) continue;
		context.recordPasses(2);
		diagnostics.push(...syntacticDiagnostics(filename, context));
		diagnostics.push(
			...context.service
				.getSemanticDiagnostics(filename)
				.map((diagnostic) => normalizeDiagnostic(diagnostic, 'semantic', context))
		);
	}
	return uniqueDiagnostics(diagnostics);
}

/** Produces syntax diagnostics without invoking semantic TypeScript analysis. */
export function syntacticDiagnostics(
	filename: string,
	context: Pick<
		LanguageServiceDiagnosticContext,
		'compilerOptions' | 'readFile' | 'preferredFilename'
	>
): ExpressionDiagnostic[] {
	const source = context.readFile(filename);
	if (source === undefined) return [];
	const {
		composite: _composite,
		declaration: _declaration,
		incremental: _incremental,
		moduleDetection: _moduleDetection,
		noEmit: _noEmit,
		...transpileOptions
	} = context.compilerOptions;
	const result = ts.transpileModule(source, {
		compilerOptions: transpileOptions,
		fileName: filename,
		reportDiagnostics: true
	});
	return (result.diagnostics ?? []).map((diagnostic) => {
		const normalized = normalizeDiagnostic(diagnostic, 'syntax', context);
		return normalized.filename
			? normalized
			: { ...normalized, filename: context.preferredFilename(filename) };
	});
}

/** Normalizes TypeScript diagnostics while preserving the caller's preferred filename casing. */
export function normalizeDiagnostic(
	diagnostic: ts.Diagnostic,
	phase: ExpressionDiagnostic['phase'],
	context: Pick<LanguageServiceDiagnosticContext, 'preferredFilename'>
): ExpressionDiagnostic {
	const normalized = diagnosticFromTs(diagnostic, phase);
	return normalized.filename
		? { ...normalized, filename: context.preferredFilename(normalized.filename) }
		: normalized;
}
