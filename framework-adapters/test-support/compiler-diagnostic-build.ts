import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const execute = promisify(execFile);

/**
 * Builds one diagnostic fixture and releases its compiler resources.
 * Explicit owned modules opt those paths into compiler processing through the public include option.
 * Omission preserves each adapter's ordinary source-ownership discovery.
 */
export async function buildDiagnosticFixture(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string,
	target: 'client' | 'server',
	localization = false,
	exposeExports = false,
	useHostRoot: boolean | 'override' = false,
	testPackageRoot?: string,
	ownedModule?: string | readonly string[]
) {
	const testRequire = testPackageRoot
		? createRequire(path.join(testPackageRoot, 'package.json'))
		: undefined;
	const options = {
		...(useHostRoot === true ? {} : { applicationRoot: root }),
		target,
		...(ownedModule === undefined
			? {}
			: { include: typeof ownedModule === 'string' ? [ownedModule] : [...ownedModule] }),
		serverComponents: true,
		reactCompatibility: false,
		...(localization ? { internationalization: { owner: 'fixture', sourceLocale: 'en-US' } } : {})
	};
	const hostRoot = useHostRoot === 'override' ? workspace : root;
	const warnings: string[] = [];
	const diagnostics: Array<{ message: string; code?: string; plugin?: string }> = [];
	const diagnosticReceipt = path.join(root, `${target}-build-diagnostics.json`);
	const outdir = path.join(root, `out-${target}`);
	if (adapter === 'vite') {
		const require = createRequire(new URL('../vite-plugin/package.json', import.meta.url));
		if (testRequire) {
			const runner = path.join(root, 'vite-build.mjs');
			const receipt = path.join(root, 'vite-warnings.json');
			await writeFile(
				runner,
				`import {build} from ${JSON.stringify(pathToFileURL(require.resolve('vite')).href)};
import {exact} from ${JSON.stringify(pathToFileURL(testRequire.resolve('@exactjs/vite-plugin')).href)};
import {writeFile} from 'node:fs/promises';
const warnings=[],diagnostics=[];
await build({root:${JSON.stringify(hostRoot)},configFile:false,logLevel:'silent',plugins:[exact(${JSON.stringify(options)})],build:{outDir:${JSON.stringify(outdir)},ssr:${JSON.stringify(target === 'server' ? path.join(root, 'entry.tsx') : false)},lib:{entry:${JSON.stringify(path.join(root, 'entry.tsx'))},formats:['es'],fileName:'entry'},minify:false,rollupOptions:{onwarn:warning=>{warnings.push(warning.message);diagnostics.push({message:warning.message,code:warning.code,plugin:warning.plugin})}}}});
await writeFile(${JSON.stringify(receipt)},JSON.stringify(warnings));
await writeFile(${JSON.stringify(diagnosticReceipt)},JSON.stringify(diagnostics));`
			);
			await execute(process.execPath, [runner], { cwd: useHostRoot ? workspace : root });
			return JSON.parse(await readFile(receipt, 'utf8')) as string[];
		}
		const { build } = await import(pathToFileURL(require.resolve('vite')).href);
		const { exact } = await import('../vite-plugin/src/index.js');
		await build({
			root: hostRoot,
			configFile: false,
			logLevel: 'silent',
			plugins: [exact(options)],
			build: {
				outDir: outdir,
				ssr: target === 'server' ? path.join(root, 'entry.tsx') : false,
				lib: { entry: path.join(root, 'entry.tsx'), formats: ['es'], fileName: 'entry' },
				minify: false,
				rollupOptions: {
					onwarn: (warning: { message: string; code?: string; plugin?: string }) => {
						warnings.push(warning.message);
						diagnostics.push({
							message: warning.message,
							code: warning.code,
							plugin: warning.plugin
						});
					}
				}
			}
		});
	} else if (adapter === 'webpack') {
		if (testRequire) {
			// Preserve normal Node package identity instead of letting Vitest replace private packages.
			const runner = path.join(root, 'webpack-build.mjs');
			const receipt = path.join(root, 'webpack-warnings.json');
			const pluginEntry = testRequire.resolve('@exactjs/webpack-plugin');
			const expected = {
				compiler: testRequire.resolve('@exactjs/compiler'),
				policy: testRequire.resolve('@exactjs/component-library-policy'),
				loader: testRequire.resolve('@exactjs/webpack-plugin/loader')
			};
			await writeFile(
				runner,
				`
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import webpack from ${JSON.stringify(pathToFileURL(createRequire(import.meta.url).resolve('webpack')).href)};
const pluginEntry=${JSON.stringify(pluginEntry)};
const expected=${JSON.stringify(expected)};
const require=createRequire(pluginEntry);
assert.equal(require.resolve('@exactjs/compiler'),expected.compiler);
assert.equal(require.resolve('@exactjs/component-library-policy'),expected.policy);
assert.equal(require.resolve('@exactjs/webpack-plugin/loader'),expected.loader);
const policy=await import(pathToFileURL(expected.policy).href);
assert.equal(typeof policy.requiresExactServerComponentSelection,'function');
const {ExactWebpackPlugin}=await import(pathToFileURL(pluginEntry).href);
const warnings=[];
const compiler=webpack({mode:'development',target:${JSON.stringify(target === 'server' ? 'node' : 'web')},context:${JSON.stringify(hostRoot)},
 entry:${JSON.stringify(path.join(root, 'entry.tsx'))},
 output:${JSON.stringify({ path: outdir, filename: 'entry.cjs', ...(exposeExports ? { library: { type: 'commonjs2' } } : {}) })},
 resolve:{extensions:['.tsx','.ts','.js'],extensionAlias:{'.js':['.js','.ts','.tsx']}},
 resolveLoader:{modules:${JSON.stringify([path.join(testPackageRoot!, 'node_modules'), path.join(workspace, 'node_modules')])}},
 plugins:[new ExactWebpackPlugin(${JSON.stringify(options)})],infrastructureLogging:{level:'none'}});
compiler.hooks.infrastructureLog.tap('CompilerDiagnosticEvidence',(_origin,type,args)=>{
 if(type==='warn')warnings.push((args??[]).map(String).join(' '));
});
let failed=false,failure;
try{
 await new Promise((resolve,reject)=>compiler.run((error,stats)=>{
  if(error)reject(error);
  else if(!stats||stats.hasErrors())reject(new Error(stats?.toString({all:false,errors:true})??'Missing Webpack stats'));
  else{for(const warning of stats.toJson({all:false,warnings:true}).warnings??[])warnings.push(typeof warning==='string'?warning:warning.message);resolve();}
 }));
}catch(error){failed=true;failure=error}
finally{try{await new Promise((resolve,reject)=>compiler.close(error=>error?reject(error):resolve()))}catch(error){if(!failed){failed=true;failure=error}}}
if(failed)throw failure;
await writeFile(${JSON.stringify(receipt)},JSON.stringify(warnings));
`
			);
			await execute(process.execPath, [runner], { cwd: useHostRoot ? workspace : root });
			return JSON.parse(await readFile(receipt, 'utf8')) as string[];
		}
		const { default: webpack } = await import('webpack');
		const { ExactWebpackPlugin } = await import('../webpack-plugin/dist/index.js');
		const compiler = webpack({
			mode: 'development',
			target: 'node',
			context: hostRoot,
			entry: path.join(root, 'entry.tsx'),
			output: {
				path: outdir,
				filename: 'entry.cjs',
				...(exposeExports ? { library: { type: 'commonjs2' } } : {})
			},
			resolve: {
				extensions: ['.tsx', '.ts', '.js'],
				extensionAlias: { '.js': ['.js', '.ts', '.tsx'] }
			},
			resolveLoader: {
				modules: [
					path.join(testPackageRoot ?? workspace, 'node_modules'),
					...(testPackageRoot ? [path.join(workspace, 'node_modules')] : [])
				]
			},
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
			`import {exact} from ${JSON.stringify(testRequire ? pathToFileURL(testRequire.resolve('@exactjs/bun-plugin')).href : new URL('../bun-plugin/dist/index.js', import.meta.url).href)};
const plugin=exact(${JSON.stringify(options)});
try { const result=await Bun.build({root:${JSON.stringify(hostRoot)},entrypoints:[${JSON.stringify(path.join(root, 'entry.tsx'))}],outdir:${JSON.stringify(outdir)},target:${JSON.stringify(testRequire && target === 'client' ? 'browser' : 'bun')},naming:{entry:'[name].[ext]'},plugins:[plugin]});
 if(!result.success) throw new Error(result.logs.map(log=>log.message).join('\\n'));
} finally {await plugin.dispose();}`
		);
		const result = await execute(process.env.BUN_EXECUTABLE ?? 'bun', [runner], {
			cwd: useHostRoot ? workspace : root
		});
		if (result.stderr) warnings.push(result.stderr);
	}
	if (adapter === 'vite') await writeFile(diagnosticReceipt, JSON.stringify(diagnostics));
	return warnings;
}

/**
 * Requires a diagnostic-clean build while retaining Rolldown's nonfatal timing advice.
 * Every warning remains in the build result and receipt. Only the bundler-owned
 * PLUGIN_TIMINGS code is advisory. Plugin warnings, unknown codes and mismatched
 * receipts fail. Advice is printed unchanged, without disabling bundler checks.
 */
export async function assertDiagnosticBuildWarnings(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string,
	target: 'client' | 'server',
	warnings: readonly string[]
): Promise<void> {
	if (adapter !== 'vite') {
		assert.deepEqual(warnings, []);
		return;
	}
	const diagnostics = JSON.parse(
		await readFile(path.join(root, `${target}-build-diagnostics.json`), 'utf8')
	) as Array<{ message: string; code?: string; plugin?: string }>;
	assert.deepEqual(
		diagnostics.map((warning) => warning.message),
		warnings,
		'Build warning receipt must preserve the complete warning sequence'
	);
	for (const warning of diagnostics) {
		assert.equal(warning.code, 'PLUGIN_TIMINGS', warning.message);
		assert.equal(warning.plugin, undefined, warning.message);
		console.warn(warning.message);
	}
}
