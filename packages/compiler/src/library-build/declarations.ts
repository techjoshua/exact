import path from 'node:path';
import typescript from 'typescript';
import type ts from 'typescript';
import { isProductionSourceDirectory, isProductionSourceFile } from './sources.js';

/**
 * Emits declarations without rebuilding references or writing outside dist or into replaceable targets.
 * Selective compilation can retain TypeScript JavaScript for modules not lowered by eXact.
 */
export async function emitLibraryDeclarations(
	root: string,
	project = 'tsconfig.json',
	excludeFixtures = false,
	targetDirectories: readonly string[] = ['client', 'server'],
	preserveSupportJavaScript = false
): Promise<void> {
	const configFile = path.resolve(root, project);
	const config = typescript.readConfigFile(configFile, typescript.sys.readFile);
	const parsed = typescript.parseJsonConfigFileContent(
		config.config ?? {},
		typescript.sys,
		path.dirname(configFile),
		{
			noEmit: false,
			declaration: true,
			emitDeclarationOnly: !preserveSupportJavaScript,
			noEmitOnError: true,
			incremental: false,
			composite: false
		},
		configFile
	);
	const format = (diagnostics: readonly ts.Diagnostic[]) =>
		typescript.formatDiagnosticsWithColorAndContext(diagnostics, {
			getCanonicalFileName: (value) => value,
			getCurrentDirectory: () => root,
			getNewLine: () => '\n'
		});
	const errors = [...(config.error ? [config.error] : []), ...parsed.errors];
	if (errors.length) throw new Error(format(errors));
	const output = path.join(root, 'dist');
	const options = {
		...parsed.options,
		outDir: parsed.options.outDir ?? output,
		rootDir: parsed.options.rootDir ?? path.join(root, 'src'),
		tsBuildInfoFile: undefined
	};

	// Target trees are rebuilt from the neutral TypeScript output, so declarations must not
	// originate inside a tree that the target emitter will replace.
	for (const directory of [options.outDir, options.declarationDir].filter(
		(value): value is string => Boolean(value)
	)) {
		const relative = path.relative(output, directory);
		if (
			relative.startsWith('..') ||
			path.isAbsolute(relative) ||
			targetDirectories.includes(relative.split(path.sep)[0]!)
		)
			throw new Error(
				'Library TypeScript output must stay inside dist, outside the client and server target directories'
			);
	}
	const program = typescript.createProgram({
		rootNames: parsed.fileNames.filter((filename) => {
			const segments = path.relative(root, filename).split(path.sep);
			const basename = segments.pop()!;
			return (
				segments.every(isProductionSourceDirectory) &&
				(/\.d\.[cm]?ts$/i.test(basename) || isProductionSourceFile(basename, excludeFixtures))
			);
		}),
		options,
		projectReferences: parsed.projectReferences
	});
	const diagnostics = typescript.getPreEmitDiagnostics(program);
	if (diagnostics.some((value) => value.category === typescript.DiagnosticCategory.Error))
		throw new Error(format(diagnostics));
	const result = program.emit(undefined, (filename, text, bom) => {
		const relative = path.relative(output, path.resolve(filename));
		if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
			throw new Error(`Library TypeScript output must stay inside dist: ${filename}`);
		if (targetDirectories.includes(relative.split(path.sep)[0]!))
			throw new Error(
				`Library TypeScript output ${filename} overlaps a target directory; rename it with exactTargetDirectories`
			);
		typescript.sys.writeFile(filename, text, bom);
	});
	if (
		result.emitSkipped ||
		result.diagnostics.some((value) => value.category === typescript.DiagnosticCategory.Error)
	)
		throw new Error(format(result.diagnostics) || 'TypeScript skipped library declarations');
}
