import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextEncoder as NodeTextEncoder } from 'node:util';

/**
 * Bundles artifacts against external workspace runtimes, retaining authored callable names for semantic controls.
 * Preserves the artifact target on the bundle URL for hosts with compileTestModules enabled.
 * Explicit aliases select paired providers when Node defaults differ from the artifact target.
 * Optional host JSX mode transforms preserved compiled-component expressions with the public JSX entry.
 */
export async function importArtifact(
	entry: string,
	output: string,
	aliases: Record<string, string> = {},
	hostJsx?: 'production' | 'development'
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
		const source = await readFile(entry, 'utf8');
		// Keep the compiler-issued importer facts through this test-owned bundle.
		// Dropping them makes the receiving adapter re-analyze already lowered code.
		const facts = source.split('\n').filter((line) => line.startsWith('// exact:component-build/'));
		await build({
			stdin: {
				contents: source,
				loader: hostJsx ? 'tsx' : 'ts',
				resolveDir: path.dirname(entry),
				sourcefile: path.basename(entry)
			},
			outfile: output,
			footer: { js: facts.join('\n') },
			bundle: true,
			keepNames: true,
			...(hostJsx
				? {
						jsx: 'automatic' as const,
						jsxImportSource: '@exactjs/jsx',
						jsxDev: hostJsx === 'development'
					}
				: {}),
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
