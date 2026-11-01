import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Builds the owned browser fixture into out-client and releases its adapter/compiler resources. */
export async function buildNativeBrowserFixture(adapter: 'vite' | 'bun' | 'webpack', root: string) {
	if (adapter === 'vite') {
		await buildDiagnosticFixture(adapter, root, 'client', false, true);
		return;
	}
	const options = {
		applicationRoot: root,
		target: 'client' as const,
		serverComponents: true,
		reactCompatibility: false
	};
	if (adapter === 'bun') {
		const { execFile } = await import('node:child_process');
		const { promisify } = await import('node:util');
		const script = path.join(root, 'build.mjs');
		await writeFile(
			script,
			`import {exact} from ${JSON.stringify(new URL('../bun-plugin/dist/index.js', import.meta.url).href)};
const plugin=exact(${JSON.stringify(options)});try{const result=await Bun.build({entrypoints:['./entry.tsx'],outdir:'./out-client',target:'browser',format:'esm',naming:'entry.js',plugins:[plugin]});if(!result.success)throw new Error(result.logs.map(x=>x.message).join('\\n'));}finally{await plugin.dispose();}`
		);
		await promisify(execFile)(process.env.BUN_EXECUTABLE ?? 'bun', [script], { cwd: root });
		return;
	}
	const { default: webpack } = await import('webpack');
	const { ExactWebpackPlugin } = await import('../webpack-plugin/dist/index.js');
	const compiler = webpack({
		mode: 'development',
		target: 'web',
		context: root,
		entry: './entry.tsx',
		output: {
			path: path.join(root, 'out-client'),
			filename: 'entry.cjs',
			library: { type: 'commonjs2' }
		},
		resolve: {
			extensions: ['.tsx', '.ts', '.js'],
			extensionAlias: { '.js': ['.js', '.ts', '.tsx'] }
		},
		resolveLoader: { modules: [path.resolve('node_modules')] },
		plugins: [new ExactWebpackPlugin(options)],
		infrastructureLogging: { level: 'none' }
	});
	try {
		await new Promise<void>((resolve, reject) =>
			compiler.run((error, stats) =>
				error
					? reject(error)
					: !stats || stats.hasErrors()
						? reject(
								new Error(stats?.toString({ all: false, errors: true }) ?? 'Missing webpack stats')
							)
						: resolve()
			)
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			compiler.close((error) => (error ? reject(error) : resolve()))
		);
	}
}
