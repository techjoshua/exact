import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { exact } from '@exactjs/vite-plugin';

const fixtureRoot = path.resolve(import.meta.dirname, '..', 'performance-fixtures');
const vitePluginRequire = createRequire(
	path.resolve(import.meta.dirname, '..', '..', 'framework-adapters', 'vite-plugin', 'package.json')
);
const { build } = await import(pathToFileURL(vitePluginRequire.resolve('vite')).href);

/**
 * Builds compiler-owned framework fixtures through the production Vite adapter.
 *
 * The returned paths remain owned by the caller, which must remove the supplied output directory.
 */
export async function buildPerformanceFixtures(outputDirectory) {
	const started = performance.now();
	await buildFixture(
		path.join(fixtureRoot, 'client-scenarios.tsx'),
		outputDirectory,
		'client-scenarios.mjs',
		true
	);
	await buildFixture(
		path.join(fixtureRoot, 'server-scenarios.tsx'),
		outputDirectory,
		'server-scenarios.mjs',
		true
	);
	await buildFixture(
		path.join(fixtureRoot, 'browser-entry.ts'),
		outputDirectory,
		'browser-entry.js',
		false
	);
	const elapsedMs = performance.now() - started;
	const paths = {
		client: path.join(outputDirectory, 'client-scenarios.mjs'),
		server: path.join(outputDirectory, 'server-scenarios.mjs'),
		browser: path.join(outputDirectory, 'browser-entry.js')
	};
	const bytes = {};
	for (const [name, filename] of Object.entries(paths)) {
		const content = await readFile(filename);
		bytes[name] = {
			raw: content.byteLength,
			gzip: gzipSync(content).byteLength,
			brotli: brotliCompressSync(content).byteLength
		};
	}
	return { elapsedMs, paths, bytes };
}

async function buildFixture(entry, outputDirectory, entryFileName, server) {
	await build({
		configFile: false,
		logLevel: 'warn',
		plugins: [exact()],
		build: {
			...(server ? { ssr: entry } : {}),
			outDir: outputDirectory,
			emptyOutDir: false,
			minify: false,
			target: 'es2022',
			rollupOptions: {
				input: entry,
				output: { entryFileNames: entryFileName }
			}
		}
	});
}
