import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inspectExactComponentBuildFacts } from '@exactjs/compiler';
import { writeExactPublishedComponentBuildFacts } from '@exactjs/compiler/component-library-build';

/** Unchanged application source whose enhancement behavior depends only on build configuration. */
export async function createConfigurationWatchFixture(librarySource = false) {
	const workspace = fileURLToPath(new URL('../../', import.meta.url));
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/configuration-watch-'));
	const dispose = () => rm(root, { recursive: true, force: true });
	const sourceRoot = librarySource ? path.join(root, 'kit') : root;
	await mkdir(sourceRoot, { recursive: true });
	const configFile = path.join(sourceRoot, 'exact.config.mjs');
	const configure = (enabled: boolean | null) =>
		enabled === null
			? rm(configFile, { force: true })
			: writeFile(
					configFile,
					enabled
						? "export * as theme from '@exactjs/theme/enhancements' with {type:'exact-enhancement',scope:'package'}; export default {};"
						: 'export default {};'
				);
	try {
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({
				name: 'configuration-watch',
				private: true,
				type: 'module',
				...(librarySource ? { dependencies: { '@fixture/config-kit': '1.0.0' } } : {})
			})
		);
		if (librarySource)
			await writeFile(
				path.join(sourceRoot, 'package.json'),
				JSON.stringify({
					name: '@fixture/config-kit',
					version: '1.0.0',
					private: true,
					type: 'module',
					exports: './page.tsx',
					dependencies: { '@exactjs/component-library': '^0.7.0', '@exactjs/theme': '^0.7.0' },
					exactComponentLibrary: { protocol: 1, build: './component-build.json' }
				})
			);
		await writeFile(
			path.join(root, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					jsx: 'preserve',
					jsxImportSource: '@exactjs/jsx',
					lib: ['ESNext', 'DOM'],
					skipLibCheck: true
				},
				include: ['**/*.ts', '**/*.tsx']
			})
		);
		await writeFile(
			path.join(sourceRoot, 'page.tsx'),
			'export function Page(){return ()=> <section theme:scope theme:appearance="dark"><input theme:field value="unchanged"/></section>;}'
		);
		await writeFile(
			path.join(root, 'entry.tsx'),
			`import {Page} from './${librarySource ? 'kit/' : ''}page.js';import {renderToString} from '@exactjs/ssr';export const render=async()=> (await renderToString(<Page/>)).html.includes('exact-theme-field');`
		);
		await writeFile(
			path.join(root, 'run.ts'),
			"import {render} from './entry.js';console.log(JSON.stringify(await render()));"
		);
		await configure(true);
		if (librarySource) {
			// A foreign source package participates in server authorization independently of namespace ownership.
			const filename = path.join(sourceRoot, 'page.tsx');
			const source = await readFile(filename, 'utf8');
			const facts = inspectExactComponentBuildFacts(source, {
				filename,
				root: sourceRoot,
				target: 'server'
			});
			await writeExactPublishedComponentBuildFacts(sourceRoot, 'component-build.json', {
				package: { name: '@fixture/config-kit', version: '1.0.0' },
				modules: [{ path: 'page.tsx', facts }],
				exports: [
					{
						subpath: '.',
						condition: 'default',
						module: 'page.tsx',
						componentModule: 'page.tsx',
						exportName: 'Page',
						componentId: facts.components[0]!.id
					}
				]
			});
		}
		return { root, workspace, configFile, configure, dispose };
	} catch (error) {
		await dispose();
		throw error;
	}
}

/** Evaluates each emitted generation in its own runtime so module caching cannot mask stale builds. */
export async function readConfigurationBundle(
	filename: string,
	runtime = process.execPath
): Promise<boolean> {
	const result = await promisify(execFile)(runtime, [filename], { timeout: 10000 });
	if (result.stderr) throw new Error(result.stderr);
	return JSON.parse(result.stdout) as boolean;
}
