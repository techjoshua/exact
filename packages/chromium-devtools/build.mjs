import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const packageRoot = fileURLToPath(new URL('./', import.meta.url));
const dist = fileURLToPath(new URL('./dist/', import.meta.url));
const sourceEntry = (file) => fileURLToPath(new URL(`./src/${file}`, import.meta.url));
await mkdir(dist, { recursive: true });

// Manifest V3 content scripts execute as classic scripts. TypeScript emits ESM markers for these
// source modules, so bundle only the manifest-owned content entries into isolated IIFEs.
await build({
	absWorkingDir: packageRoot,
	entryPoints: [sourceEntry('page-bridge.ts'), sourceEntry('content-script.ts')],
	outdir: dist,
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: 'es2022',
	sourcemap: true
});

// Extension pages and the module service worker cannot resolve workspace package specifiers.
// Bundle each manifest entry independently while retaining its module execution context.
await build({
	absWorkingDir: packageRoot,
	entryPoints: [sourceEntry('background.ts'), sourceEntry('devtools.ts'), sourceEntry('panel.ts')],
	outdir: dist,
	bundle: true,
	format: 'esm',
	platform: 'browser',
	target: 'es2022',
	sourcemap: true
});

for (const file of ['devtools.html', 'panel.html', 'panel.css']) {
	await cp(
		new URL(`./src/static/${file}`, import.meta.url),
		new URL(`./dist/${file}`, import.meta.url)
	);
}
