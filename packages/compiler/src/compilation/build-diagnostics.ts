import type { NativeCompilerDiagnostic } from '../native/process-diagnostic-contracts.js';

/** A compiler diagnostic shape that build-tool integrations can report. */
export type ExactBuildDiagnostic = Readonly<{
	code: string;
	message: string;
	filename?: string;
	span?: Readonly<{ line: number; column: number }>;
}>;

/** Returns the stable identity used to deduplicate one build diagnostic. */
export function exactDiagnosticKey(diagnostic: ExactBuildDiagnostic): string {
	return `${diagnostic.code}:${diagnostic.span?.line}:${diagnostic.span?.column}:${diagnostic.message}`;
}

/** Formats a compiler diagnostic consistently across build-tool integrations. */
export function formatExactDiagnostic(diagnostic: ExactBuildDiagnostic): string {
	const location = diagnostic.filename
		? `${diagnostic.filename}${diagnostic.span ? `:${diagnostic.span.line}:${diagnostic.span.column}` : ''}`
		: 'TypeScript';
	return `${location} - ${diagnostic.code}: ${diagnostic.message}`;
}

/** Reports warning diagnostics once per invocation while preserving each structured target result. */
export function reportExactCompilerWarnings(
	diagnostics: readonly NativeCompilerDiagnostic[],
	warn: (message: string) => void
): void {
	const seen = new Set<string>();
	for (const diagnostic of diagnostics) {
		if (diagnostic.severity !== 'warning') continue;
		const key = JSON.stringify([
			diagnostic.filename,
			diagnostic.severity,
			diagnostic.code,
			...(diagnostic.start === undefined
				? [diagnostic.line, diagnostic.column]
				: [diagnostic.start, diagnostic.length])
		]);
		if (seen.has(key)) continue;
		seen.add(key);
		warn(
			formatExactDiagnostic({
				code: diagnostic.code,
				message: diagnostic.message,
				filename: diagnostic.filename,
				...(diagnostic.line === undefined
					? {}
					: { span: { line: diagnostic.line, column: diagnostic.column ?? 1 } })
			})
		);
	}
}
