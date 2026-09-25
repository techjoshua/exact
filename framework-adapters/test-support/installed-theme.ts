import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/** Creates physical runtime packages and authored or paired SSR input; caller owns dispose(). */
export async function createInstalledThemeFixture(
	mode: 'authored' | 'paired' | 'published',
	availability: 'enabled' | 'excluded' | 'absent' = 'enabled'
) {
	const excluded = availability === 'excluded';
	const workspace = fileURLToPath(new URL('../../', import.meta.url));
	const root = await mkdtemp(path.join(tmpdir(), 'exact-installed-theme-'));
	const dispose = () => rm(root, { recursive: true, force: true });
	try {
		await writeFile(
			path.join(root, 'package.json'),
			'{"name":"installed-theme-fixture","type":"module","private":true}'
		);
		const copied = new Set<string>();
		/** Copies package files without workspace symlinks changing dependency resolution. */
		async function copyPackage(name: string): Promise<void> {
			if (copied.has(name)) return;
			copied.add(name);
			const source = path.join(workspace, 'node_modules', name);
			const manifest = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
			const destination = path.join(root, 'node_modules', name);
			await mkdir(destination, { recursive: true });
			for (const entry of await readdir(source, { withFileTypes: true }))
				if (entry.isFile())
					await cp(path.join(source, entry.name), path.join(destination, entry.name));
			if (!name.startsWith('@exactjs/'))
				await cp(source, destination, { recursive: true, dereference: true });
			if (manifest.files?.includes('dist'))
				await cp(path.join(source, 'dist'), path.join(destination, 'dist'), { recursive: true });
			for (const dependency of Object.keys(manifest.dependencies ?? {}))
				await copyPackage(dependency);
		}
		await copyPackage('@exactjs/theme');
		await copyPackage('@exactjs/jsx');
		await writeFile(
			path.join(root, 'exact.config.mjs'),
			`export * as theme from '@exactjs/theme/enhancements' with { type: 'exact-enhancement', scope: 'package' }; export default ${excluded ? "{componentLibraries:{deny:['@exactjs/theme'],unauthorizedOptionalEnhancements:'exclude'}}" : '{}'};`
		);
		await writeFile(
			path.join(root, 'Page.tsx'),
			`const formatter = new Intl.NumberFormat("en-US");
function count(value: number) { return formatter.format(value); }
/** @exact server */
export function Page() { return () => <section theme:scope theme:appearance="dark"><input theme:field aria-label="Draft" value={count(1234)} /></section>; }`
		);
		if (mode === 'paired') {
			// Separate producer/consumer processes prevent Node resolution caches from retaining a removed provider.
			const producer = path.join(root, 'compile.mjs');
			const compilerUrl = pathToFileURL(
				path.join(workspace, 'packages/compiler/dist/index.js')
			).href;
			await writeFile(
				producer,
				`import { compileProjectArtifacts } from ${JSON.stringify(compilerUrl)};
await compileProjectArtifacts([${JSON.stringify(path.join(root, 'Page.tsx'))}], ${JSON.stringify({ rootDir: root, outDir: path.join(root, 'dist/compiled'), serverComponents: true })});`
			);
			await promisify(execFile)(process.execPath, [producer], { timeout: 30_000 });
		}
		if (mode === 'published') {
			const library = path.join(root, 'node_modules/@fixture/page');
			await mkdir(library, { recursive: true });
			await writeFile(
				path.join(library, 'package.json'),
				JSON.stringify({
					name: '@fixture/page',
					version: '1.0.0',
					type: 'module',
					exports: './dist/Page.js',
					dependencies: { '@exactjs/component-library': '^0.6.0' },
					optionalDependencies: { '@exactjs/theme': '^0.6.0' },
					exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' }
				})
			);
			await writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({
					name: 'installed-theme-fixture',
					type: 'module',
					private: true,
					dependencies: { '@fixture/page': '1.0.0' }
				})
			);
			const producer = path.join(root, 'publish.mjs');
			const url = (file: string) => JSON.stringify(pathToFileURL(path.join(workspace, file)).href);
			await writeFile(
				producer,
				`import { compileProject } from ${url('packages/compiler/dist/index.js')};
import { writeExactPublishedComponentBuildFacts } from ${url('packages/compiler/dist/component-library-build.js')};
import { transform } from ${url('node_modules/esbuild/lib/main.js')};
import { readFile, writeFile } from 'node:fs/promises';
const [result] = await compileProject([${JSON.stringify(path.join(root, 'Page.tsx'))}], ${JSON.stringify({ rootDir: root, root, outDir: path.join(library, 'dist'), target: 'server', serverComponents: true })});
const emitted = await transform(await readFile(result.outputFile,'utf8'), {loader:'ts',format:'esm'});
await writeFile(${JSON.stringify(path.join(library, 'dist/Page.js'))},emitted.code);
await writeExactPublishedComponentBuildFacts(${JSON.stringify(library)}, 'dist/exact-component-build.json', {
 package:{name:'@fixture/page',version:'1.0.0'},
 modules:[{path:'dist/Page.js',facts:result.componentBuild}],
 exports:[{subpath:'.',condition:'default',module:'dist/Page.js',componentModule:'dist/Page.js',exportName:'Page',componentId:result.componentBuild.components[0].id}]
});`
			);
			await promisify(execFile)(process.execPath, [producer], { timeout: 30_000 });
		}
		await writeFile(
			path.join(root, 'entry.tsx'),
			`import { Page } from '${mode === 'published' ? '@fixture/page' : mode === 'paired' ? './dist/compiled/Page.exact.server.js' : './Page.js'}';
import { renderToString } from '@exactjs/ssr';
export const render = () => renderToString(<Page />);`
		);
		await writeFile(
			path.join(root, 'run.ts'),
			`import {render} from './entry.js'; const {html}=await render(); console.log(JSON.stringify({scope:html.includes('data-exact-theme='),field:html.includes('exact-theme-field'),input:html.includes('aria-label="Draft"') && html.includes('value="1,234"')}));`
		);
		if (excluded) {
			const manifestPath = path.join(root, 'node_modules/@exactjs/theme/package.json');
			const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
			await writeFile(manifestPath, JSON.stringify({ ...manifest, sideEffects: true }));
			const provider = path.join(root, 'node_modules/@exactjs/theme/dist/server/enhancements.js');
			await writeFile(
				provider,
				`throw new Error('EXCLUDED_PROVIDER_EXECUTED');\n${await readFile(provider, 'utf8')}`
			);
		}
		if (availability === 'absent') {
			await rm(path.join(root, 'node_modules/@exactjs/theme'), { recursive: true, force: true });
			await writeFile(path.join(root, 'exact.config.mjs'), 'export default {};');
		}
		return { root, workspace, dispose };
	} catch (error) {
		await dispose();
		throw error;
	}
}
