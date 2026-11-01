import { realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Disposable inspection loader and canonical output roots, encoded as file URLs. */
export interface LibraryInspectionResolution {
	readonly resolver: string;
	readonly published: string;
	readonly staged: string;
}

// Node owns export conditions, patterns, private imports, and exclusions. Only paths into
// this package's published output are redirected, including when the first build has no dist.
const resolver = `
let published;
let staged;
let selections;
let port;
export function initialize(data) {
 published = data.published;
 staged = data.staged;
 selections = data.selections;
 port = data.port;
}
export async function resolve(specifier, context, nextResolve) {
 const selectionIndex = specifier.startsWith('exact-library-inspection:')
  ? Number(specifier.slice('exact-library-inspection:'.length)) : undefined;
 if (selectionIndex !== undefined) {
  const selection = selections?.[selectionIndex];
  if (!selection) throw new Error('Unknown library inspection selection');
  specifier = selection.specifier;
  context = {...context, parentURL: selection.parent};
 }
 let resolution;
 try {
  resolution = await nextResolve(specifier, context);
 } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' || typeof error.url !== 'string' ||
      !error.url.startsWith(published)) throw error;
  resolution = {url: error.url};
 }
 if (resolution.url.startsWith(published))
  resolution = await nextResolve(staged + resolution.url.slice(published.length), context);
 if (selectionIndex !== undefined) port.postMessage({index:selectionIndex, url:resolution.url});
 return resolution;
}
`;

/**
 * Supplies a disposable resolver for inspecting the staged generation through package exports.
 * Node retains its resolution rules and package scope. Successful and missing published output
 * paths both resolve into the candidate, never falling back to a previous generation.
 * The caller owns the staged output's parent directory. No published files are modified.
 */
export async function withLibraryInspectionResolution<T>(
	packageRoot: string,
	stagedOutput: string,
	inspect: (scope: LibraryInspectionResolution) => Promise<T>
): Promise<T> {
	const filename = path.join(path.dirname(stagedOutput), 'inspection-resolver.mjs');
	await writeFile(filename, resolver, { flag: 'wx' });
	try {
		return await inspect({
			resolver: pathToFileURL(filename).href,
			published: pathToFileURL(path.join(await realpath(packageRoot), 'dist') + path.sep).href,
			staged: pathToFileURL((await realpath(stagedOutput)) + path.sep).href
		});
	} finally {
		await rm(filename);
	}
}
