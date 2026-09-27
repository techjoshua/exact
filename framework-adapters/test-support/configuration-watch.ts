import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/** Unchanged application source whose enhancement behavior depends only on build configuration. */
export async function createConfigurationWatchFixture() {
	const workspace = fileURLToPath(new URL('../../', import.meta.url));
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/configuration-watch-'));
	const dispose = () => rm(root, { recursive: true, force: true });
	const configFile = path.join(root, 'exact.config.mjs');
	const configure = (enabled: boolean) =>
		writeFile(
			configFile,
			enabled
				? "export * as theme from '@exactjs/theme/enhancements' with {type:'exact-enhancement',scope:'package'}; export default {};"
				: 'export default {};'
		);
	try {
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({ name: 'configuration-watch', private: true, type: 'module' })
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
				include: ['*.ts', '*.tsx']
			})
		);
		await writeFile(
			path.join(root, 'page.tsx'),
			'export function Page(){return ()=> <section theme:scope theme:appearance="dark"><input theme:field value="unchanged"/></section>;}'
		);
		await writeFile(
			path.join(root, 'entry.tsx'),
			"import {Page} from './page.js';import {renderToString} from '@exactjs/ssr';export const render=async()=> (await renderToString(<Page/>)).html.includes('exact-theme-field');"
		);
		await writeFile(
			path.join(root, 'run.ts'),
			"import {render} from './entry.js';console.log(JSON.stringify(await render()));"
		);
		await configure(true);
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
