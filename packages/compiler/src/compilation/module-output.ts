import path from 'node:path';
import type { TransformResult } from '../types.js';
import { sourceMapPathFor, withSourceMapFile, withSourceMappingUrl } from '../source-maps.js';
import type { CompilerOutputMutation } from './output-transaction.js';

const hostCodeOwner = '\n// eXact generated host JSX implementation\n';
const hostMapOwner = '"x_exactHostJsx": true';

/** Gives a JSX-bearing implementation its host parser while retaining target recognition and relative imports. */
function hostJsxFile(file: string): string {
	if (!/\.[jt]s$/i.test(file)) return file;
	return file.replace(/(\.exact\.(?:client|server|shared))?(\.[jt]s)$/i, '.host-jsx$1$2x');
}

/** Resolves the file that contains the executable code and owns its source map. */
export function implementationFile(planned: string, output: TransformResult): string {
	return output.preservesHostJsx ? hostJsxFile(planned) : planned;
}

/** Forwards the authored module exports from its planned entry to the selected implementation. */
export function moduleFacade(hasDefault: boolean, sharedFile: string, targetFile: string): string {
	let specifier = path.relative(path.dirname(targetFile), sharedFile).replaceAll(path.sep, '/');
	if (!specifier.startsWith('.')) specifier = `./${specifier}`;
	const lines = [`export * from ${JSON.stringify(specifier)};`];
	if (hasDefault) {
		lines.push(`export { default } from ${JSON.stringify(specifier)};`);
	}
	return `${lines.join('\n')}\n`;
}

/** Stages the code, optional forwarding entry, and maps as one output generation. */
export function prepareModuleOutput(
	mutations: CompilerOutputMutation[],
	planned: string,
	hasDefault: boolean,
	output?: TransformResult,
	mapFile?: string,
	paired?: { facade?: string }
): void {
	const facade = paired?.facade;
	const host = hostJsxFile(planned);
	const actual = output && !facade ? implementationFile(planned, output) : planned;
	const ownsHost = actual !== planned;
	// Single-target output can share a directory with authored modules. Only the
	// companion introduced by this publisher may replace or remove a sibling.
	const rawCode = ownsHost && !paired ? output?.code + hostCodeOwner : output?.code;
	const code =
		rawCode !== undefined && mapFile
			? withSourceMappingUrl(rawCode, path.basename(mapFile))
			: rawCode;
	mutations.push({
		file: planned,
		content: facade ?? (ownsHost ? moduleFacade(hasDefault, actual, planned) : code)
	});
	if (host !== planned)
		mutations.push({
			file: host,
			content: ownsHost ? code : undefined,
			ownerMarker: paired ? undefined : hostCodeOwner
		});
	if (mapFile && output?.map) {
		const map = withSourceMapFile(output.map, path.basename(actual));
		mutations.push({
			file: mapFile,
			content: `${JSON.stringify(ownsHost && !paired ? { ...map, x_exactHostJsx: true } : map, null, 2)}\n`,
			ownerMarker: ownsHost && !paired ? hostMapOwner : undefined
		});
	}
	if (paired && mapFile !== sourceMapPathFor(planned))
		mutations.push({ file: sourceMapPathFor(planned) });
	if (host !== planned && mapFile !== sourceMapPathFor(host))
		mutations.push({
			file: sourceMapPathFor(host),
			ownerMarker: paired ? undefined : hostMapOwner
		});
}
