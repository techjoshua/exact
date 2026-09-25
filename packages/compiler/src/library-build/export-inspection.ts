import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

// A fresh process prevents repeated API builds from inspecting cached transitive exports.
// Inspection intentionally executes author-owned modules, never untrusted consumer packages.
const inspection = `
const [entry, names, target] = JSON.parse(process.argv[1]);
const namespace = await import(entry);
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
process.stdout.write('\\nEXACT_LIBRARY_EXPORTS=' + JSON.stringify(identities) + '\\n', () => process.exit(0));
`;

/** Inspects compiled identities in a bounded, disposable Node process, free of ESM cache state. */
export async function inspectLibraryExports(
	entry: string,
	names: string[],
	target: string
): Promise<Record<string, string>> {
	const { stdout } = await promisify(execFile)(
		process.execPath,
		[
			'--input-type=module',
			'--eval',
			inspection,
			JSON.stringify([pathToFileURL(entry).href, names, target])
		],
		{ timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }
	);
	const marker = '\nEXACT_LIBRARY_EXPORTS=';
	const offset = stdout.lastIndexOf(marker);
	if (offset < 0) throw new Error(`Library export inspection returned no result: ${entry}`);
	return JSON.parse(stdout.slice(offset + marker.length)) as Record<string, string>;
}
