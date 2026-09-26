import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const execute = promisify(execFile);
const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Verifies that each adapter preserves executable exports despite unrelated project effects. */
export async function verifyProjectSourceIsolation(
	adapter: 'vite' | 'webpack' | 'bun'
): Promise<void> {
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/source-isolation-'));
	try {
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/source-isolation', type: 'module', private: true })
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: { jsx: 'preserve', module: 'ESNext', moduleResolution: 'Bundler' },
					include: ['*.ts', '*.tsx']
				})
			),
			writeFile(
				path.join(root, 'setup.ts'),
				'process.env.EXACT_SOURCE_ISOLATION = "server-only"; export {};'
			),
			writeFile(path.join(root, 'browser.ts'), 'window.name = "client-only"; export {};'),
			writeFile(
				path.join(root, 'helper.tsx'),
				'export function renderLabBox(props: { text: string }) { return <p>{props.text}</p>; }'
			),
			writeFile(
				path.join(root, 'lazy-view.tsx'),
				'export function renderLazyBox(props: { text: string }) { return <section>{props.text}</section>; }'
			),
			writeFile(
				path.join(root, 'entry.ts'),
				'export { renderLabBox } from "./helper.js"; export async function loadBox() { return (await import("./lazy-view.js")).renderLazyBox({text:"lazy"}); }'
			)
		]);
		for (const target of ['client', 'server'] as const) {
			const outdir = path.join(root, target);
			const options = {
				applicationRoot: root,
				target,
				serverComponents: true,
				reactCompatibility: false
			};
			let output = path.join(outdir, 'entry.mjs');
			if (adapter === 'vite') {
				const viteRequire = createRequire(new URL('../vite-plugin/package.json', import.meta.url));
				const { exact } = await import('../vite-plugin/src/index.js');
				const { build } = await import(pathToFileURL(viteRequire.resolve('vite')).href);
				await build({
					root,
					configFile: false,
					logLevel: 'silent',
					plugins: [exact(options)],
					build: {
						outDir: outdir,
						ssr: target === 'server' ? path.join(root, 'entry.ts') : false,
						rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
						lib: {
							entry: path.join(root, 'entry.ts'),
							formats: ['es'],
							fileName: () => 'entry.mjs'
						},
						minify: false
					}
				});
			} else if (adapter === 'webpack') {
				const { default: webpack } = await import('webpack');
				const { ExactWebpackPlugin } = await import('../webpack-plugin/dist/index.js');
				const compiler = webpack({
					mode: 'production',
					target: 'node',
					context: root,
					entry: './entry.ts',
					output: { path: outdir, filename: 'entry.mjs', library: { type: 'module' } },
					experiments: { outputModule: true },
					resolve: {
						extensions: ['.tsx', '.ts', '.js'],
						extensionAlias: { '.js': ['.js', '.ts', '.tsx'] }
					},
					resolveLoader: { modules: [path.join(workspace, 'node_modules')] },
					plugins: [new ExactWebpackPlugin(options)]
				});
				try {
					const stats = await new Promise<import('webpack').Stats>((resolve, reject) =>
						compiler.run((error, stats) =>
							error
								? reject(error)
								: stats
									? resolve(stats)
									: reject(new Error('Missing Webpack stats'))
						)
					);
					assert.equal(stats.hasErrors(), false, stats.toString({ all: false, errors: true }));
				} finally {
					await new Promise<void>((resolve, reject) =>
						compiler.close((error) => (error ? reject(error) : resolve()))
					);
				}
			} else {
				const runner = path.join(root, 'build.mjs');
				await writeFile(
					runner,
					`import { exact } from ${JSON.stringify(new URL('../bun-plugin/dist/index.js', import.meta.url).href)};
const plugin = exact(${JSON.stringify(options)});
try {
 const result = await Bun.build({entrypoints:[${JSON.stringify(path.join(root, 'entry.ts'))}],outdir:${JSON.stringify(outdir)},target:'bun',format:'esm',plugins:[plugin]});
 if (!result.success) throw new Error(JSON.stringify(result.logs));
} finally { await plugin.dispose(); }`
				);
				await execute(process.env.BUN_EXECUTABLE ?? 'bun', [runner], { cwd: root });
				output = path.join(outdir, 'entry.js');
			}
			const verifier = path.join(root, 'verify.mjs');
			await writeFile(
				verifier,
				`import { renderLabBox, loadBox } from ${JSON.stringify(pathToFileURL(output).href)};
if (typeof renderLabBox !== 'function' || !renderLabBox({text:'visible'})) throw new Error('Missing executable JSX helper');
if (!await loadBox()) throw new Error('Missing executable lazy JSX helper');
console.log('helper retained');`
			);
			const result = await execute(
				adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
				[verifier],
				{ cwd: root }
			);
			assert.equal(result.stdout.trim(), 'helper retained');
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
