import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Checks that executable components and host-owned text/URL representations retain separate meaning. */
export async function verifySourceRepresentationContract(adapter: 'vite' | 'webpack' | 'bun') {
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp', `source-representation-${adapter}-`));
	try {
		const source = 'export function Probe() { return () => <p>source example</p>; }';
		await writeFile(path.join(root, 'Probe.tsx'), source);
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({ name: '@fixture/source-representation', type: 'module', private: true })
		);
		await writeFile(path.join(root, 'exact.config.mjs'), 'export default {};');
		await writeFile(
			path.join(root, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					jsx: 'preserve',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					strict: true
				}
			})
		);
		await writeFile(
			path.join(root, 'entry.tsx'),
			`import {Probe} from './Probe.js';
import text from './Probe.tsx?raw';import queried from './Probe.tsx?raw&example=1';import url from './Probe.tsx?url';
export {Probe,text,queried,url};export function fixture(){return <Probe/>;}`
		);
		for (const target of ['client', 'server'] as const) {
			const outDir = path.join(root, `out-${target}`);
			const options = { target, applicationRoot: root, reactCompatibility: false as const };
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
						outDir,
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
					context: root,
					target: 'node',
					entry: './entry.tsx',
					output: { path: outDir, filename: 'entry.cjs', library: { type: 'commonjs2' } },
					resolve: {
						extensions: ['.tsx', '.ts', '.js'],
						extensionAlias: { '.js': ['.js', '.ts', '.tsx'] }
					},
					module: {
						rules: [
							{ resourceQuery: /(?:^|[?&])raw(?:[=&]|$)/, type: 'asset/source' },
							{ resourceQuery: /(?:^|[?&])url(?:[=&]|$)/, type: 'asset/resource' }
						]
					},
					plugins: [new ExactWebpackPlugin(options)],
					infrastructureLogging: { level: 'none' }
				});
				try {
					await new Promise<void>((resolve, reject) =>
						compiler.run((error, stats) => {
							if (error) reject(error);
							else if (!stats || stats.hasErrors())
								reject(new Error(stats?.toString({ all: false, errors: true }) ?? 'Missing stats'));
							else resolve();
						})
					);
				} finally {
					await new Promise<void>((resolve, reject) =>
						compiler.close((error) => (error ? reject(error) : resolve()))
					);
				}
			} else {
				// Bun has no built-in ?raw convention. The host loader owns its separate asset namespace.
				const runner = path.join(root, `build-${target}.mjs`);
				await writeFile(
					runner,
					`import {exact} from ${JSON.stringify(new URL('../bun-plugin/dist/index.js', import.meta.url).href)};
import path from 'node:path';const plugin=exact(${JSON.stringify(options)});
const assets={name:'source-assets',setup(build){build.onResolve({filter:/\\?(?:raw|url)(?:&|$)/},args=>({path:path.resolve(path.dirname(args.importer),args.path),namespace:'source-assets'}));build.onLoad({filter:/.*/,namespace:'source-assets'},async args=>({contents:new URLSearchParams(args.path.split('?')[1]).has('raw')?await Bun.file(args.path.split('?')[0]).text():args.path.split('?')[0],loader:'text'}));}};
try{const result=await Bun.build({root:${JSON.stringify(root)},entrypoints:[${JSON.stringify(path.join(root, 'entry.tsx'))}],outdir:${JSON.stringify(outDir)},target:'bun',plugins:[assets,plugin],naming:{entry:'entry.js'}});if(!result.success)throw new Error(result.logs.map(log=>log.message).join('\\n'));}finally{await plugin.dispose();}`
				);
				await promisify(execFile)(process.env.BUN_EXECUTABLE ?? 'bun', [runner], { cwd: root });
			}
			const output = (await readdir(outDir)).find((file) => /^entry\.(?:js|mjs|cjs)$/.test(file));
			assert.ok(output);
			const verify = path.join(root, `verify-${target}.mjs`);
			await writeFile(
				verify,
				`import assert from 'node:assert/strict';
const imported=await import(${JSON.stringify('./out-' + target + '/' + output)});const result=imported.Probe?imported:imported.default;
assert.equal(typeof result.Probe,'function');assert.equal(result.text,${JSON.stringify(source)});assert.equal(result.queried,result.text);assert.equal(typeof result.url,'string');assert.ok(result.url.length);
${target === 'server' ? `const {renderToString}=await import('@exactjs/ssr');assert.ok((await renderToString(result.fixture())).html.includes('source example'));` : ''}`
			);
			await promisify(execFile)(
				adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
				[verify],
				{ cwd: root }
			);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
