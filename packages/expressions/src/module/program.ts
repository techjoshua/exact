import ts from 'typescript';

export function bindSourceFile(
	filename: string,
	source: string
): { sourceFile: ts.SourceFile; checker: ts.TypeChecker } {
	const normalized = pathKey(filename);
	let entry = rewritePrograms.get(normalized);
	if (!entry) {
		entry = createRewriteProgram(filename, normalized);
		rewritePrograms.set(normalized, entry);
		if (rewritePrograms.size > 64) rewritePrograms.delete(rewritePrograms.keys().next().value!);
	}
	if (entry.source === source && entry.program && entry.sourceFile) {
		return { sourceFile: entry.sourceFile, checker: entry.program.getTypeChecker() };
	}
	entry.source = source;
	entry.sourceFile = undefined;
	entry.program = ts.createProgram({
		rootNames: [filename],
		options: entry.compilerOptions,
		host: entry.host,
		oldProgram: entry.program
	});
	const sourceFile = entry.program.getSourceFile(filename);
	if (!sourceFile) throw new Error(`Unable to parse ${filename}`);
	entry.sourceFile = sourceFile;
	return { sourceFile, checker: entry.program.getTypeChecker() };
}

type RewriteProgramEntry = {
	source?: string;
	sourceFile?: ts.SourceFile;
	program?: ts.Program;
	compilerOptions: ts.CompilerOptions;
	host: ts.CompilerHost;
};

const rewritePrograms = new Map<string, RewriteProgramEntry>();

function createRewriteProgram(filename: string, normalized: string): RewriteProgramEntry {
	const compilerOptions: ts.CompilerOptions = {
		target: ts.ScriptTarget.Latest,
		module: ts.ModuleKind.ESNext,
		noLib: true,
		noResolve: true,
		allowJs: true
	};
	const entry = { compilerOptions } as RewriteProgramEntry;
	const host = ts.createCompilerHost(compilerOptions, true);
	host.fileExists = (file) => pathKey(file) === normalized;
	host.readFile = (file) => (pathKey(file) === normalized ? entry.source : undefined);
	host.getSourceFile = (file, languageVersion) =>
		pathKey(file) === normalized
			? ts.createSourceFile(
					filename,
					entry.source ?? '',
					languageVersion,
					true,
					scriptKind(filename)
				)
			: undefined;
	host.writeFile = () => {};
	entry.host = host;
	return entry;
}

export function pathKey(value: string): string {
	return value.replaceAll('\\', '/').toLowerCase();
}
export function safeIdentifier(value: string): string {
	return value.replace(/[^$A-Z_a-z0-9]/g, '_');
}

export function scriptKind(filename: string): ts.ScriptKind {
	const clean = filename.split('?', 1)[0]!;
	if (/\.tsx$/i.test(clean)) return ts.ScriptKind.TSX;
	if (/\.jsx$/i.test(clean)) return ts.ScriptKind.JSX;
	if (/\.[cm]?js$/i.test(clean)) return ts.ScriptKind.JS;
	if (/\.json$/i.test(clean)) return ts.ScriptKind.JSON;
	return ts.ScriptKind.TS;
}
