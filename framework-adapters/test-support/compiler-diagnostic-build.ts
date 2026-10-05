import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const execute = promisify(execFile);

/** Build one diagnostic fixture through its adapter and release compiler resources. */
export async function buildDiagnosticFixture(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string,
	target: 'client' | 'server',
	localization = false
) {
	const options = {
		applicationRoot: root,
		target,
		serverComponents: true,
		reactCompatibility: false,
		...(localization ? { internationalization: { owner: 'fixture', sourceLocale: 'en-US' } } : {})
	};
	const warnings: string[] = [];
	const outdir = path.join(root, `out-${target}`);
	if (adapter === 'vite') {
		const require = createRequire(new URL('../vite-plugin/package.json', import.meta.url));
		const { build } = await import(pathToFileURL(require.resolve('vite')).href);
		const { exact } = await import('../vite-plugin/src/index.js');
		await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [exact(options)],
			build: {
				outDir: outdir,
				ssr: target === 'server' ? path.join(root, 'entry.tsx') : false,
				lib: { entry: path.join(root, 'entry.tsx'), formats: ['es'], fileName: 'entry' },
				minify: false,
				rollupOptions: { onwarn: (warning: { message: string }) => warnings.push(warning.message) }
			}
		});
	} else if (adapter === 'webpack') {
		const { default: webpack } = await import('webpack');
		const { ExactWebpackPlugin } = await import('../webpack-plugin/dist/index.js');
		const compiler = webpack({
			mode: 'development',
			target: 'node',
			context: root,
			entry: './entry.tsx',
			output: { path: outdir, filename: 'entry.cjs' },
			resolve: {
				extensions: ['.tsx', '.ts', '.js'],
				extensionAlias: { '.js': ['.js', '.ts', '.tsx'] }
			},
			resolveLoader: { modules: [path.join(workspace, 'node_modules')] },
			plugins: [new ExactWebpackPlugin(options)],
			infrastructureLogging: { level: 'none' }
		});
		compiler.hooks.infrastructureLog.tap('CompilerDiagnosticEvidence', (_origin, type, args) => {
			if (type === 'warn') warnings.push((args ?? []).map(String).join(' '));
		});
		try {
			await new Promise<void>((resolve, reject) =>
				compiler.run((error, stats) => {
					if (error) reject(error);
					else if (!stats || stats.hasErrors())
						reject(
							new Error(stats?.toString({ all: false, errors: true }) ?? 'Missing Webpack stats')
						);
					else {
						for (const warning of stats.toJson({ all: false, warnings: true }).warnings ?? [])
							warnings.push(typeof warning === 'string' ? warning : warning.message);
						resolve();
					}
				})
			);
		} finally {
			await new Promise<void>((resolve, reject) =>
				compiler.close((error) => (error ? reject(error) : resolve()))
			);
		}
	} else {
		const runner = path.join(root, 'build.mjs');
		await writeFile(
			runner,
			`import {exact} from ${JSON.stringify(new URL('../bun-plugin/dist/index.js', import.meta.url).href)};
const plugin=exact(${JSON.stringify(options)});
try { const result=await Bun.build({entrypoints:[${JSON.stringify(path.join(root, 'entry.tsx'))}],outdir:${JSON.stringify(outdir)},target:'bun',plugins:[plugin]});
 if(!result.success) throw new Error(result.logs.map(log=>log.message).join('\\n'));
} finally {await plugin.dispose();}`
		);
		const result = await execute(process.env.BUN_EXECUTABLE ?? 'bun', [runner], { cwd: root });
		warnings.push(result.stderr);
	}
	return warnings;
}
