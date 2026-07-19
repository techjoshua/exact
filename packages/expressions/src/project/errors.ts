import type { ExpressionDiagnostic } from '../model.js';

/** Raised when an expression project cannot create a valid bound module. */
export class ExpressionProjectError extends Error {
	constructor(readonly diagnostics: readonly ExpressionDiagnostic[]) {
		super(diagnostics.map(formatExpressionDiagnostic).join('\n'));
		this.name = 'ExpressionProjectError';
	}
}

function formatExpressionDiagnostic(diagnostic: ExpressionDiagnostic): string {
	const location = diagnostic.filename
		? `${diagnostic.filename}${diagnostic.span ? `:${diagnostic.span.line}:${diagnostic.span.column}` : ''}`
		: diagnostic.span
			? `${diagnostic.span.line}:${diagnostic.span.column}`
			: undefined;
	return `${location ? `${location} - ` : ''}${diagnostic.code}: ${diagnostic.message}`;
}
