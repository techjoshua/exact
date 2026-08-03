import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Returns the deterministic extension-client bundle contract used by builds and tests. */
export function extensionBundleOptions() {
	return Object.freeze({
		absWorkingDir: packageRoot,
		entryPoints: [path.join(packageRoot, 'src', 'extension.ts')],
		outfile: path.join(packageRoot, 'dist', 'extension.js'),
		bundle: true,
		external: ['vscode'],
		format: 'esm',
		platform: 'node',
		target: 'node20',
		banner: {
			js: "import { createRequire as __exactCreateRequire } from 'node:module'; const require = __exactCreateRequire(import.meta.url);"
		},
		sourcemap: true,
		logLevel: 'info'
	});
}

/** Bundles extension-owned runtime dependencies beneath the registered extension path. */
export async function bundleExtensionClient() {
	await build(extensionBundleOptions());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await bundleExtensionClient();
}
