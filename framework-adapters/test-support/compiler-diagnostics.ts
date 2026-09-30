import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const execute = promisify(execFile);

/** Each adapter must retain an imported helper's diagnostic and accept its truthful contract. */
export async function verifyCompilerDiagnostics(
	adapter: 'vite' | 'webpack' | 'bun'
): Promise<void> {
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/diagnostic-adapter-'));
	try {
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/compiler-diagnostics', type: 'module', private: true })
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						target: 'ESNext',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						jsx: 'preserve'
					},
					include: ['*.tsx', '*.ts']
				})
			),
			writeFile(
				path.join(root, 'entry.tsx'),
				`import { helper } from './helper.js'; export function Page(props:{value:string}){const label=helper(props.value);return ()=> <p>{label}</p>;}`
			)
		]);
		const helper = `export function helper(value:string){const values:string[]=[];values.push(value);return values.join('');}`;
		for (const target of ['client', 'server'] as const) {
			await writeFile(path.join(root, 'helper.ts'), helper);
			let failure: unknown;
			try {
				await build(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			assert.ok(failure, `${adapter}/${target} accepted an unproven helper`);
			const message = String(failure);
			for (const text of ['EXACT2202', 'values.push(value)', '@exact pure', 'helper.ts'])
				assert.ok(message.includes(text), `${adapter}/${target} lost ${text}: ${message}`);
			await writeFile(path.join(root, 'helper.ts'), '/** @exact pure */\n' + helper);
			await build(adapter, root, target);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function build(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string,
	target: 'client' | 'server'
) {
	const options = {
		applicationRoot: root,
		target,
		serverComponents: true,
		reactCompatibility: false
	};
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
				minify: false
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
			plugins: [new ExactWebpackPlugin(options)]
		});
		try {
			await new Promise<void>((resolve, reject) =>
				compiler.run((error, stats) => {
					if (error) reject(error);
					else if (!stats || stats.hasErrors())
						reject(
							new Error(stats?.toString({ all: false, errors: true }) ?? 'Missing Webpack stats')
						);
					else resolve();
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
		await execute(process.env.BUN_EXECUTABLE ?? 'bun', [runner], { cwd: root });
	}
}
