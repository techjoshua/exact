import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

// A fresh process per target prevents repeated builds from inspecting cached transitive exports.
// Inspection intentionally executes author-owned modules, never untrusted consumer packages.
const inspection = `
let input = '';
for await (const chunk of process.stdin) input += chunk;
const [entries, target] = JSON.parse(input);
const results = [];
const namespaces = [];
for (const {entry} of entries) namespaces.push(await import(entry));
for (const [index, {entry, names}] of entries.entries()) {
const namespace = namespaces[index];
const identities = Object.create(null);
for (const name of names) {
 const component = namespace[name];
 const contract = component?.[Symbol.for('@exactjs/component-contract')];
 const identity = component?.[Symbol.for('@exactjs/component')];
 if (typeof component !== 'function' || !contract?.artifact ||
     contract.artifact.target !== target || contract.artifact.id !== identity || typeof identity !== 'string')
  throw new Error(target + ' export ' + name + ' is not a compiled component artifact: ' + entry);
 if (target === 'client' && contract.placement === 'server')
  throw new Error('Client export ' + name + ' contains a server boundary instead of an executable client artifact');
 identities[name] = identity;
}
results.push(identities);
}
process.stdout.write('\\nEXACT_LIBRARY_EXPORTS=' + JSON.stringify(results) + '\\n', () => process.exit(0));
`;

/**
 * Inspects one target's entries in a bounded, disposable Node process.
 * Imports share a generation's ESM graph. Later builds and other targets get fresh processes.
 * Input travels over stdin so large export sets do not exceed platform argument limits.
 */
export async function inspectLibraryExports(
	entries: readonly Readonly<{ entry: string; names: readonly string[] }>[],
	target: string
): Promise<readonly Record<string, string>[]> {
	if (!entries.length) return [];
	const payload = JSON.stringify([
		entries.map(({ entry, names }) => ({ entry: pathToFileURL(entry).href, names })),
		target
	]);
	const execution = promisify(execFile)(
		process.execPath,
		['--input-type=module', '--eval', inspection],
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
	const results: unknown = JSON.parse(stdout.slice(offset + marker.length));
	if (!Array.isArray(results) || results.length !== entries.length)
		throw new Error(`Library export inspection returned invalid results for ${target}`);
	return results as Record<string, string>[];
}
