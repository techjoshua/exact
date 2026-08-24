import {
	composeExactSourceMaps,
	isExactSourceMap,
	type ExactSourceMap
} from '@exactjs/compiler/adapter-support';
import { transform, type Loader } from 'esbuild';
import path from 'node:path';
import type { ExactWebpackTransformResult } from './transform.js';

const typescriptLoaders = new Map<string, Loader>([
	['.ts', 'ts'],
	['.mts', 'ts'],
	['.cts', 'ts'],
	['.tsx', 'tsx']
]);

/** Erases TypeScript after eXact compilation so Webpack always receives executable JavaScript. */
export async function transpileExactWebpackResult(
	result: ExactWebpackTransformResult,
	filename: string,
	sourceMap: boolean
): Promise<ExactWebpackTransformResult> {
	const loader = typescriptLoaders.get(path.extname(filename).toLowerCase());
	if (!loader) return result;
	const transpiled = await transform(result.code, {
		format: 'esm',
		legalComments: 'inline',
		loader,
		sourcefile: filename,
		sourcemap: sourceMap ? 'external' : false,
		sourcesContent: true,
		target: 'es2022'
	});
	return {
		...result,
		code: transpiled.code,
		map: sourceMap ? composedSourceMap(transpiled.map, result.map) : null
	};
}

function composedSourceMap(transpiledMap: string, compilerMap: unknown): ExactSourceMap {
	const parsed = JSON.parse(transpiledMap) as unknown;
	if (!isExactSourceMap(parsed)) throw new TypeError('esbuild returned an invalid source map');
	return isExactSourceMap(compilerMap) ? composeExactSourceMaps(parsed, compilerMap) : parsed;
}
