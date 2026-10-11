import path from 'node:path';
import typescript from 'typescript';

/** Reports whether a source directory belongs to published production code. */
export function isProductionSourceDirectory(name: string) {
	return name !== 'test-support' && name !== '__tests__';
}

/** Excludes test files and their outputs while retaining public entries named jest.ts or jest.js. */
export function isUnpublishedTestFile(name: string) {
	return /(?:^|\.)(?:test|spec)\.[^/\\]+$|\.jest\.[^/\\]+$/i.test(name);
}

/** Reports whether a source file belongs to target-local package compilation. */
export function isProductionSourceFile(name: string, excludeFixtures: boolean) {
	return (
		/\.[cm]?[jt]sx?$/i.test(name) &&
		!/\.d\.[cm]?ts$/i.test(name) &&
		!isUnpublishedTestFile(name) &&
		(!excludeFixtures || !/(?:^|\.)fixtures?\.[cm]?[jt]sx?$/i.test(name))
	);
}
/** Selects production project roots and their imported source dependencies using TypeScript rules. */
export function libraryProjectSources(
	root: string,
	project: string,
	excludeFixtures: boolean
): string[] {
	const filename = path.resolve(root, project);
	const config = typescript.readConfigFile(filename, typescript.sys.readFile);
	const parsed = typescript.parseJsonConfigFileContent(
		config.config ?? {},
		typescript.sys,
		path.dirname(filename),
		undefined,
		filename
	);
	const errors = [...(config.error ? [config.error] : []), ...parsed.errors];
	if (errors.length)
		throw new Error(
			typescript.formatDiagnosticsWithColorAndContext(errors, {
				getCanonicalFileName: (value) => value,
				getCurrentDirectory: () => root,
				getNewLine: () => '\n'
			})
		);
	const sourceRoot = path.join(root, 'src');
	const production = (filename: string) => {
		const relative = path.relative(sourceRoot, filename);
		if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
			return false;
		const segments = relative.split(path.sep);
		return (
			isProductionSourceFile(segments.pop()!, excludeFixtures) &&
			segments.every(isProductionSourceDirectory)
		);
	};
	// TypeScript excludes project roots, while imports still bring excluded modules into
	// the program. Compile that closure so paired artifacts never retain a missing import.
	const program = typescript.createProgram({
		rootNames: parsed.fileNames.filter(production),
		options: parsed.options,
		projectReferences: parsed.projectReferences
	});
	for (const source of program.getSourceFiles()) {
		if (source.isDeclarationFile) continue;
		const relative = path.relative(sourceRoot, source.fileName);
		if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
			continue;
		if (!production(source.fileName))
			throw new Error(
				`Library production code imports unpublished support source ${relative}. Move shared production code into a published source module.`
			);
	}
	return program
		.getSourceFiles()
		.map((source) => source.fileName)
		.filter(production)
		.sort();
}
