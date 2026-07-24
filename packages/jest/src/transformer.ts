import { transformSource } from '@exactjs/compiler';
import ts from 'typescript';

type JestTransformOptions = {
	supportsStaticESM?: boolean;
};

/** Creates the Jest transformer used for eXact TypeScript and TSX modules. */
export function createTransformer() {
	return {
		process(sourceText: string, sourcePath: string, options?: JestTransformOptions) {
			const exactSource =
				/\.tsx$/i.test(sourcePath) && !isTestModule(sourcePath)
					? transformSource(sourceText, { filename: sourcePath }).code
					: sourceText;
			const transpiled = ts.transpileModule(exactSource, {
				fileName: sourcePath,
				compilerOptions: {
					target: ts.ScriptTarget.ES2022,
					module: options?.supportsStaticESM ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS,
					jsx: ts.JsxEmit.ReactJSX,
					jsxImportSource: '@exactjs/jsx',
					sourceMap: true,
					inlineSources: true
				}
			});
			return {
				code: transpiled.outputText,
				map: transpiled.sourceMapText
			};
		},
		getCacheKey(sourceText: string, sourcePath: string) {
			return `${ts.version}\0${sourcePath}\0${sourceText}`;
		}
	};
}

function isTestModule(sourcePath: string): boolean {
	return /(?:^|[\\/])[^\\/]+\.(?:test|spec|jest)\.[cm]?[jt]sx?$/i.test(sourcePath);
}

export default { createTransformer };
