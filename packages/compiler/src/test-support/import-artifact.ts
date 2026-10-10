import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextEncoder as NodeTextEncoder } from 'node:util';

/**
 * Bundles artifacts against external workspace runtimes, retaining authored callable names for semantic controls.
 * Preserves the artifact target on the bundle URL for hosts with compileTestModules enabled.
 * Explicit aliases select paired providers when Node defaults differ from the artifact target.
 */
export async function importArtifact(
	entry: string,
	output: string,
	aliases: Record<string, string> = {}
): Promise<Record<string, unknown>> {
	const previousTextEncoder = globalThis.TextEncoder;
	const previousUint8Array = globalThis.Uint8Array;
	globalThis.TextEncoder = NodeTextEncoder;
	globalThis.Uint8Array = new NodeTextEncoder().encode('').constructor as Uint8ArrayConstructor;
	let target: 'client' | 'server' | undefined;
	try {
		// Public adapter support may load esbuild too. Normalize the realm before either
		// import, and restore it even if module initialization fails.
		const { build } = await import('esbuild');
		const { exactGeneratedArtifactTarget } = await import('../artifacts.js');
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
			alias: aliases,
			external: ['@exactjs/*']
		});
		target = exactGeneratedArtifactTarget(entry);
	} finally {
		globalThis.TextEncoder = previousTextEncoder;
		globalThis.Uint8Array = previousUint8Array;
	}
	const url = pathToFileURL(output);
	if (target) url.searchParams.set('exact-target', target);
	return import(url.href);
}
