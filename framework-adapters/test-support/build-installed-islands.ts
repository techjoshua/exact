import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

/** Builds the same isolated installed-library fixture through each adapter's actual host hooks. */
export async function buildInstalledIslands(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	const output = path.join(root, 'out');
	await mkdir(output);
	for (const target of ['server', 'client'] as const) {
		const entry = path.join(root, target === 'server' ? 'server.tsx' : 'client.ts');
		const options = {
			applicationRoot: root,
			target,
			serverComponents: true,
			reactCompatibility: false
		};
		if (adapter === 'vite') {
			const require = createRequire(new URL('../vite-plugin/package.json', import.meta.url));
			const { build } = await import(pathToFileURL(require.resolve('vite')).href);
			const { exact } = await import('../vite-plugin/src/index.js');
			const result = await build({
				root,
				configFile: false,
				logLevel: 'silent',
				plugins: [exact(options)],
				build: {
					write: false,
					minify: false,
					ssr: target === 'server' ? entry : false,
					lib: { entry, formats: ['es'] },
					rollupOptions: { output: { inlineDynamicImports: true } }
				},
				ssr: { noExternal: true }
			});
			const outputs = (Array.isArray(result) ? result : [result]).flatMap((value) => value.output);
			const chunk = outputs.find(
				(value: { type: string; isEntry?: boolean }) => value.type === 'chunk' && value.isEntry
			);
			assert.ok(chunk, 'Missing installed entry chunk');
			assert.ok(
				Object.keys(chunk.modules).some((id) => id.includes('/@fixture/islands/dist/')),
				'Installed library was not selected'
			);
			await writeFile(path.join(output, target + '.mjs'), chunk.code);
		} else if (adapter === 'webpack') {
			const { default: webpack } = await import('webpack');
			const { ExactWebpackPlugin } = await import('../webpack-plugin/dist/index.js');
			const compiler = webpack({
				mode: 'production',
				target: target === 'server' ? 'node' : 'web',
				context: root,
				entry,
				output: { path: output, filename: target + '.mjs', library: { type: 'module' } },
				experiments: { outputModule: true },
				optimization: { minimize: false },
				resolveLoader: {
					alias: {
						'@exactjs/webpack-plugin/loader': fileURLToPath(
							new URL('../webpack-plugin/dist/loader.js', import.meta.url)
						)
					}
				},
				resolve: {
					extensions: ['.tsx', '.ts', '.js'],
					extensionAlias: { '.js': ['.js', '.ts', '.tsx'] }
				},
				plugins: [new ExactWebpackPlugin(options)]
			});
			try {
				const stats = await new Promise<import('webpack').Stats>((resolve, reject) =>
					compiler.run((error, stats) =>
						error
							? reject(error)
							: stats
								? resolve(stats)
								: reject(new Error('Missing installed build stats'))
					)
				);
				assert.equal(stats.hasErrors(), false, stats.toString({ all: false, errors: true }));
			} finally {
				await new Promise<void>((resolve, reject) =>
					compiler.close((error) => (error ? reject(error) : resolve()))
				);
			}
		} else {
			const runner = path.join(root, 'build-' + target + '.mjs');
			await writeFile(
				runner,
				`import {exact} from ${JSON.stringify(new URL('../bun-plugin/dist/index.js', import.meta.url).href)};
const plugin=exact(${JSON.stringify(options)});try {const result=await Bun.build({entrypoints:[${JSON.stringify(entry)}],outdir:${JSON.stringify(output)},naming:${JSON.stringify(target + '.mjs')},target:${JSON.stringify(target === 'server' ? 'bun' : 'browser')},format:'esm',plugins:[plugin]});if(!result.success)throw new Error(JSON.stringify(result.logs));}finally{await plugin.dispose();}`
			);
			await promisify(execFile)(process.env.BUN_EXECUTABLE ?? 'bun', [runner], { cwd: root });
		}
	}
}
