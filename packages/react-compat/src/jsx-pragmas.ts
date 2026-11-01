import ts from 'typescript';

/** Reads JSX ownership and runtime pragmas from TypeScript's leading block comments. */
export function readJsxPragmas(source: string): {
	importSources: readonly string[];
	runtime: string | undefined;
} {
	const importSources: string[] = [];
	let runtime: string | undefined;
	for (const range of ts.getLeadingCommentRanges(source, 0) ?? []) {
		if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
		// Match TypeScript's per-line pragma and first argument rules inside actual comments.
		const comment = source.slice(range.pos, range.end);
		for (const match of comment.matchAll(/@(\S+)(\s+(?:\S.*)?)?$/gm)) {
			const name = match[1]!.toLowerCase();
			const argument = match[2]?.trim().split(/\s+/)[0];
			if (name === 'jsximportsource' && argument) importSources.push(argument);
			if (name === 'jsxruntime') runtime = argument;
		}
	}
	return { importSources, runtime };
}
