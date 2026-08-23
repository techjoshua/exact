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
		{ ssr: false, target: 'client' }
	);
	await buildFixture(
		path.join(fixtureRoot, 'server-scenarios.tsx'),
		outputDirectory,
		'server-scenarios.mjs',
		{ ssr: true, target: 'server' }
	);
	await buildFixture(
		path.join(fixtureRoot, 'server-direct-entry.ts'),
		outputDirectory,
		'server-direct-scenarios.mjs',
		{ ssr: true, target: 'server' }
	);
	await buildFixture(
		path.join(fixtureRoot, 'browser-entry.ts'),
		outputDirectory,
		'browser-entry.js',
		{ ssr: false, target: 'client' }
	);
	const elapsedMs = performance.now() - started;
	const paths = {
		client: path.join(outputDirectory, 'client-scenarios.mjs'),
		server: path.join(outputDirectory, 'server-scenarios.mjs'),
		serverDirect: path.join(outputDirectory, 'server-direct-scenarios.mjs'),
		browser: path.join(outputDirectory, 'browser-entry.js')
	};
	const bytes = {};
	for (const [name, filename] of Object.entries(paths)) {
		const content = await readFile(filename);
		if (name === 'serverDirect') assertCompilerClosedServerBundle(content.toString('utf8'));
		bytes[name] = {
			raw: content.byteLength,
			gzip: gzipSync(content).byteLength,
			brotli: brotliCompressSync(content).byteLength
		};
	}
	return { elapsedMs, paths, bytes };
}

/** Builds only the compiler-closed artifact served by the sustained production HTTP benchmark. */
export async function buildServerPerformanceFixture(outputDirectory) {
	const started = performance.now();
	const filename = path.join(outputDirectory, 'server-http-scenario.mjs');
	await buildFixture(
		path.join(fixtureRoot, 'server-http-entry.ts'),
		outputDirectory,
		path.basename(filename),
		{ ssr: true, target: 'server' }
	);
	const content = await readFile(filename);
	assertCompilerClosedServerBundle(content.toString('utf8'));
	return {
		elapsedMs: performance.now() - started,
		path: filename,
		bytes: {
			raw: content.byteLength,
			gzip: gzipSync(content).byteLength,
			brotli: brotliCompressSync(content).byteLength
		}
	};
}

function assertCompilerClosedServerBundle(source) {
	for (const signature of [
		'ComponentInstanceImpl',
		'createGenericSsrComponentInstance',
		'renderGenericComponentAsync',
		'registerGenericSsrComponentRenderer',
		'SsrReadinessOwner'
	]) {
		if (source.includes(signature))
			throw new Error(`Compiler-closed server bundle retained generic runtime ${signature}`);
	}
}

async function buildFixture(entry, outputDirectory, entryFileName, options) {
	await build({
		configFile: false,
		logLevel: 'warn',
		plugins: [exact({ target: options.target })],
		build: {
			...(options.ssr ? { ssr: entry } : {}),
			outDir: outputDirectory,
			emptyOutDir: false,
			minify: false,
			target: 'es2022',
			rollupOptions: {
				input: entry,
				preserveEntrySignatures: 'strict',
				output: { entryFileNames: entryFileName }
			}
		}
	});
}
