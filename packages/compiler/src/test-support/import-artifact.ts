import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextEncoder as NodeTextEncoder } from 'node:util';

/** Bundles artifacts against external workspace runtimes, retaining authored callable names for semantic controls. */
export async function importArtifact(
	entry: string,
	output: string
): Promise<Record<string, unknown>> {
	const previousTextEncoder = globalThis.TextEncoder;
	const previousUint8Array = globalThis.Uint8Array;
	globalThis.TextEncoder = NodeTextEncoder;
	globalThis.Uint8Array = new NodeTextEncoder().encode('').constructor as Uint8ArrayConstructor;
	const { build } = await import('esbuild');
	try {
		await build({
			stdin: {
				contents: await readFile(entry, 'utf8'),
				loader: 'ts',
				resolveDir: path.dirname(entry),
				sourcefile: path.basename(entry)
			},
			outfile: output,
			bundle: true,
			keepNames: true,
			format: 'esm',
			platform: 'node',
			target: 'node22',
			packages: 'external',
			external: ['@exactjs/*']
		});
	} finally {
		globalThis.TextEncoder = previousTextEncoder;
		globalThis.Uint8Array = previousUint8Array;
	}
	return import(pathToFileURL(output).href);
}
