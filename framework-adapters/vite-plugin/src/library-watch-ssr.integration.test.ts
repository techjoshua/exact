import { it, expect } from 'vitest';
import { createLogger, createServer, type ViteDevServer } from 'vite';
import {
	watchLibraryBuild,
	type LibraryBuildWatcher
} from '../../../packages/compiler/src/library-build/watch.js';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exact } from './index.js';
import { compileProjectArtifacts } from '@exactjs/compiler';

it.each(['authored', 'paired'] as const)(
	'serves changed library SSR and retains output after invalid edits (%s)',
	async (mode) => {
		const workspace = fileURLToPath(new URL('../../../', import.meta.url));
		const root = await mkdtemp(path.join(workspace, '.tmp/library-watch-ssr-'));
		const kit = path.join(root, 'kit');
		let vite: ViteDevServer | undefined;
		let watcher: LibraryBuildWatcher | undefined;
		const errors: unknown[] = [];
		const warnings: string[] = [];
		const logger = createLogger('silent');
		logger.warn = (message) => warnings.push(message);
		let builds = 0;
		const source = (label: string) => `export function Tag(){return()=> <span>${label}</span>;}`;
		const changed = path.join(kit, 'src/Tag.tsx');
		async function waitFor(predicate: () => boolean): Promise<void> {
			const deadline = Date.now() + 15_000;
			while (!predicate()) {
				if (Date.now() >= deadline) throw new Error('Library watch publication did not settle');
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
		}
		async function regenerate(): Promise<void> {
			if (mode === 'paired')
				await compileProjectArtifacts([path.join(root, 'Page.tsx')], {
					rootDir: root,
					outDir: path.join(root, '.exact'),
					serverComponents: true
				});
		}
		async function render(): Promise<string> {
			const module = await vite!.ssrLoadModule('/entry.tsx');
			return module.render();
		}
		try {
			await mkdir(path.join(kit, 'src'), { recursive: true });
			await mkdir(path.join(root, 'node_modules/@fixture'), { recursive: true });
			await symlink(kit, path.join(root, 'node_modules/@fixture/live'), 'junction');
			await writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({
					name: 'watch-consumer',
					private: true,
					type: 'module',
					dependencies: { '@fixture/live': '1.0.0' }
				})
			);
			await writeFile(
				path.join(kit, 'package.json'),
				JSON.stringify({
					name: '@fixture/live',
					version: '1.0.0',
					type: 'module',
					exports: {
						'.': {
							types: './dist/index.d.ts',
							browser: './dist/client/index.js',
							default: './dist/server/index.js'
						}
					},
					exactCompiledComponents: ['Badge'],
					exactComponentLibrary: { protocol: 1, build: './dist/exact-component-build.json' },
					dependencies: {
						'@exactjs/core': '^0.7.0',
						'@exactjs/jsx': '^0.7.0',
						'@exactjs/component-library': '^0.7.0'
					}
				})
			);
			const configuration = {
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					jsx: 'react-jsx',
					jsxImportSource: '@exactjs/jsx',
					strict: true,
					skipLibCheck: true,
					declaration: true,
					emitDeclarationOnly: true,
					rootDir: 'src',
					outDir: 'dist'
				},
				include: ['src']
			};
			await writeFile(path.join(kit, 'tsconfig.json'), JSON.stringify(configuration));
			await writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					...configuration,
					compilerOptions: { ...configuration.compilerOptions, rootDir: '.', outDir: 'generated' },
					include: ['entry.tsx', 'Page.tsx']
				})
			);
			await writeFile(changed, source('Initial'));
			await writeFile(
				path.join(kit, 'src/index.tsx'),
				"import {Tag} from './Tag.js';export function Badge(){return()=> <Tag/>;}"
			);
			await writeFile(
				path.join(root, 'Page.tsx'),
				"import {Badge} from '@fixture/live';/** @exact server */ export function Page(){return()=> <main><Badge/></main>;}"
			);
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import {Page} from '${mode === 'paired' ? './.exact/Page.exact.server.js' : './Page.js'}';import {renderToString} from '@exactjs/ssr';export const render=async()=> (await renderToString(<Page/>)).html;`
			);
			watcher = watchLibraryBuild(
				{ root: kit },
				{ onBuild: () => builds++, onError: (error) => errors.push(error) }
			);
			await watcher.ready;
			expect(errors).toEqual([]);
			expect(builds).toBe(1);
			await regenerate();
			vite = await createServer({
				customLogger: logger,
				configFile: false,
				root,
				plugins: [exact({ serverComponents: true })],
				server: { middlewareMode: true },
				appType: 'custom',
				ssr: { noExternal: ['@fixture/live'] }
			});
			expect(await render()).toContain('Initial');
			await writeFile(changed, source('Updated'));
			await waitFor(() => builds >= 2);
			await regenerate();
			await expect.poll(render, { timeout: 15_000 }).toContain('Updated');
			for (const label of ['Second', 'Third']) {
				const before = builds;
				await writeFile(changed, source(label));
				await waitFor(() => builds > before);
				await regenerate();
				vite.moduleGraph.invalidateAll();
				await expect.poll(render, { timeout: 15_000 }).toContain(label);
			}
			expect(warnings).toEqual([]);
			await writeFile(changed, source('{missingBinding}'));
			await waitFor(() => errors.length > 0);
			expect(await render()).toContain('Third');
			const previous = builds;
			warnings.length = 0;
			await writeFile(changed, source('Recovered'));
			await waitFor(() => builds > previous);
			await regenerate();
			await expect.poll(render, { timeout: 15_000 }).toContain('Recovered');
			expect(warnings).toEqual([]);
		} finally {
			await watcher?.close();
			await vite?.close();
			await rm(root, { recursive: true, force: true });
		}
	},
	60_000
);
