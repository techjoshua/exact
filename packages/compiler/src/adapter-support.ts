/** A compiler diagnostic shape that build-tool integrations can report. */
export type ExactBuildDiagnostic = Readonly<{
	code: string;
	message: string;
	filename?: string;
	span?: Readonly<{ line: number; column: number }>;
}>;

/** A string, regular expression, or list used to filter build input paths. */
export type ExactBuildFilter = string | RegExp | readonly (string | RegExp)[];

/**
 * Creates a stateful reporter that emits only newly introduced diagnostics.
 *
 * Invalidated files are removed from the retained set after each update, so a
 * diagnostic is reported again if it disappears and later returns.
 */
export function createExactDiagnosticReporter(): (
	update: Readonly<{
		affectedFiles: readonly string[];
		diagnostics: readonly ExactBuildDiagnostic[];
	}>,
	warn: (message: string) => void
) => void {
	const previous = new Map<string, Set<string>>();
	return (update, warn) => {
		const next = new Map<string, Set<string>>();
		for (const diagnostic of update.diagnostics) {
			const file = diagnostic.filename ?? '<project>';
			let keys = next.get(file);
			if (!keys) next.set(file, (keys = new Set()));
			const key = exactDiagnosticKey(diagnostic);
			keys.add(key);
			if (!previous.get(file)?.has(key)) warn(formatExactDiagnostic(diagnostic));
		}

		// Invalidation lets resolved diagnostics disappear from the retained view.
		for (const file of update.affectedFiles) previous.delete(file.replaceAll('\\', '/'));
		for (const [file, keys] of next) previous.set(file, keys);
	};
}

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

/** Tests a build path against a string/regular-expression filter collection. */
export function matchesExactBuildFilter(id: string, filter: ExactBuildFilter): boolean {
	const patterns = Array.isArray(filter) ? filter : [filter];
	return patterns.some((pattern) => {
		if (typeof pattern === 'string') return id.includes(pattern);
		pattern.lastIndex = 0;
		return pattern.test(id);
	});
}
