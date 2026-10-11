import { transformSync } from 'esbuild';
import { composeExactSourceMaps, isExactSourceMap } from '../source-maps.js';

type AdapterOutput = { code: string; map?: unknown };

/**
 * Erases compiler-owned companion types before a JavaScript module reaches its host parser.
 * Authored TypeScript keeps the adapter's normal transpilation path. Valid compiler maps are
 * composed with this erasure so generated helpers do not shift authored source locations.
 */
export function eraseAdapterJavaScriptHelperTypes(
	output: AdapterOutput,
	filename: string
): AdapterOutput {
	if (!/\.[cm]?jsx?$/i.test(filename.split('?', 1)[0] ?? '')) return output;
	const compilerMap = isExactSourceMap(output.map) ? output.map : undefined;
	const executable = transformSync(output.code, {
		loader: 'ts',
		format: 'esm',
		legalComments: 'inline',
		sourcefile: filename,
		sourcemap: compilerMap ? 'external' : false,
		sourcesContent: true,
		target: 'esnext'
	});
	if (!compilerMap) return { ...output, code: executable.code };
	const erasedMap: unknown = JSON.parse(executable.map);
	if (!isExactSourceMap(erasedMap)) throw new TypeError('Invalid JavaScript helper erasure map');
	return { code: executable.code, map: composeExactSourceMaps(erasedMap, compilerMap) };
}
