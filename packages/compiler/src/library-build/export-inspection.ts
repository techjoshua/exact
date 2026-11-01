import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import type { LibraryInspectionResolution } from './inspection-resolution.js';

// A fresh process per target prevents repeated builds from inspecting cached transitive exports.
// Inspection intentionally executes author-owned modules, never untrusted consumer packages.
const inspection = `
import {MessageChannel} from 'node:worker_threads';
import {register} from 'node:module';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const [entries, target, scope, selections] = JSON.parse(input);
const resolutions = new Map();
if (scope) {
 const {port1,port2} = new MessageChannel();
 port1.on('message', ({index,url}) => resolutions.get(index)?.(url));
 register(scope.resolver, {parentURL: import.meta.url,
  data: {...scope,selections,port:port2}, transferList:[port2]});
}
const results = [];
const namespaces = [];
for (const {entry} of entries) namespaces.push(await import(entry));
const relativeNamespaces = [];
const relativeURLs = [];
for (const [index, selection] of selections.entries()) {
 const resolved = new Promise(resolve => resolutions.set(index, resolve));
 relativeNamespaces.push(await import('exact-library-inspection:' + index));
 relativeURLs.push(await resolved);
}
// Validate only after the complete demanded graph has evaluated. A later relative
// import can replace an earlier public alias just as another public entry can.
for (const [index, {entry, names}] of entries.entries()) {
 const identities = Object.create(null);
 for (const name of names) identities[name] = inspect(namespaces[index], name, entry);
 results.push(identities);
}
const relatives = selections.map((selection, index) => ({
 url:relativeURLs[index], identity:inspect(relativeNamespaces[index], selection.name, relativeURLs[index])
}));
function inspect(namespace, name, entry) {
 const component = namespace[name];
 const contract = component?.[Symbol.for('@exactjs/component-contract')];
 const identity = component?.[Symbol.for('@exactjs/component')];
 if (typeof component !== 'function' || !contract?.artifact ||
     contract.artifact.target !== target || contract.artifact.id !== identity || typeof identity !== 'string')
  throw new Error(target + ' export ' + name + ' is not a compiled component artifact: ' + entry);
 if (target === 'client' && contract.placement === 'server')
  throw new Error('Client export ' + name + ' contains a server boundary instead of an executable client artifact');
 return identity;
}
process.stdout.write('\\nEXACT_LIBRARY_EXPORTS=' + JSON.stringify({exports:results, relatives}) + '\\n', () => process.exit(0));
`;

/**
 * Inspects one target's entries in a bounded, disposable Node process.
 * Imports share a generation's ESM graph. Later builds and other targets get fresh processes.
 * Input travels over stdin so large export sets do not exceed platform argument limits.
 */
export async function inspectLibraryExports(
	entries: readonly Readonly<{ entry: string; names: readonly string[] }>[],
	target: string,
	scope?: LibraryInspectionResolution
): Promise<readonly Record<string, string>[]> {
	return (await inspectLibrarySelections(entries, target, scope)).exports;
}

/** A required relative export resolved from its actual staged importer by Node's loader. */
export type LibraryRelativeSelection = Readonly<{
	parent: string;
	specifier: string;
	name: string;
}>;

/** Inspects public and direct-relative selections in one fresh target-local module graph. */
export async function inspectLibrarySelections(
	entries: readonly Readonly<{ entry: string; names: readonly string[] }>[],
	target: string,
	scope?: LibraryInspectionResolution,
	selections: readonly LibraryRelativeSelection[] = []
): Promise<
	Readonly<{
		exports: readonly Record<string, string>[];
		relatives: readonly Readonly<{ url: string; identity: string }>[];
	}>
> {
	if (!entries.length && !selections.length) return { exports: [], relatives: [] };
	if (selections.length && !scope)
		throw new Error('Relative inspection requires staged resolution');
	const payload = JSON.stringify([
		entries.map(({ entry, names }) => ({ entry: pathToFileURL(entry).href, names })),
		target,
		scope,
		selections
	]);
	// Inspection uses Node's loader contract even when the builder is called from Bun.
	const nodeExecutable = process.versions.bun ? 'node' : process.execPath;
	const execution = promisify(execFile)(
		nodeExecutable,
		[
			...(target === 'client' ? ['--conditions=browser'] : []),
			'--input-type=module',
			'--eval',
			inspection
		],
		{ timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }
	);
	const input = new Promise<void>((resolve, reject) => {
		const stdin = execution.child.stdin;
		if (!stdin) return reject(new Error('Library export inspection has no input pipe'));
		stdin.once('error', reject);
		stdin.end(payload, resolve);
	});
	const [{ stdout }] = await Promise.all([execution, input]);
	const marker = '\nEXACT_LIBRARY_EXPORTS=';
	const offset = stdout.lastIndexOf(marker);
	if (offset < 0) throw new Error(`Library export inspection returned no result for ${target}`);
	const result = JSON.parse(stdout.slice(offset + marker.length));
	if (
		!Array.isArray(result.exports) ||
		result.exports.length !== entries.length ||
		!Array.isArray(result.relatives) ||
		result.relatives.length !== selections.length
	)
		throw new Error(`Library export inspection returned invalid results for ${target}`);
	return result;
}
