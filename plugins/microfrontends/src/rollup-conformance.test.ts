import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build, type Plugin } from 'vite';
import { createExactRemoteArtifactPlan } from './build.js';
import { createExactRemoteRollupAdapter, type ExactRollupOutput } from './rollup.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';
const temporaryRoots: string[] = [];

describe('Vite/Rollup remote producer conformance', () => {
	afterEach(async () => {
		await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
	});

	it('emits a bundler-neutral ESM entry with remote-relative chunks, styles, and assets', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-remote-vite-'));
		temporaryRoots.push(root);
		await mkdir(path.join(root, 'src'));
		await writeFile(path.join(root, 'page.js'), 'export const page = true;\n');
		await writeFile(
			path.join(root, 'src', 'Area.js'),
			[
				`import { createVNode } from '@exactjs/core';`,
				`import './area.css';`,
				`function Area() {`,
				`  return () => createVNode('p', null, 'remote');`,
				`}`,
				`Area.loadLazy = () => import('./lazy.js');`,
				`export default Area;`,
				''
			].join('\n')
		);
		await writeFile(
			path.join(root, 'src', 'lazy.js'),
			`globalThis.__exactRemoteLazyLoaded = true; export const lazy = 'remote-lazy';\n`
		);
		await writeFile(
			path.join(root, 'src', 'area.css'),
			`@font-face { font-family: Remote; src: url('./font.woff2'); }\np { font-family: Remote; }\n`
		);
		await writeFile(path.join(root, 'src', 'font.woff2'), new Uint8Array([0, 1, 2, 3]));

		const plan = createExactRemoteArtifactPlan(
			{
				exposes: { './Area': { component: './src/Area.js' } },
				remotes: {},
				providedPackages: []
			},
			{ packageName: '@company/remote', buildKey }
		);
		let emittedEntries: Readonly<Record<string, string>> | undefined;
		const adapter = createExactRemoteRollupAdapter({
			plan,
			applicationRoot: root,
			registrationModules: {
				'./Area': 'export const exactHydrationRegistration = {};'
			},
			onEntries(entries) {
				emittedEntries = entries;
			}
		});
		const plugin: Plugin = {
			name: 'exact-remote-conformance',
			enforce: 'pre',
			buildStart() {
				adapter.buildStart(this);
			},
			transform(code, id) {
				adapter.recordModule(code, id);
				return null;
			},
			resolveId(source, importer) {
				return adapter.resolveId(source, importer, (request, owner) =>
					this.resolve(request, owner, { skipSelf: true })
				);
			},
			load(id) {
				return adapter.load(id);
			},
			generateBundle(_output, bundle) {
				adapter.generateBundle(bundle as unknown as Readonly<Record<string, ExactRollupOutput>>);
			}
		};
		const outDir = path.join(root, 'dist');
		await build({
			root,
			logLevel: 'silent',
			plugins: [plugin],
			build: {
				outDir,
				emptyOutDir: true,
				assetsInlineLimit: 0,
				rollupOptions: { input: path.join(root, 'page.js'), output: { format: 'es' } }
			}
		});

		const entry = emittedEntries?.['./Area'];
		expect(entry).toBeDefined();
		const files = await recursiveFiles(outDir);
		expect(
			files.some((file) => /lazy.*\.js$/i.test(file)),
			JSON.stringify(files)
		).toBe(true);
		expect(files.some((file) => file.endsWith('.css'))).toBe(true);
		expect(files.some((file) => file.endsWith('.woff2'))).toBe(true);
		const javascript = (
			await Promise.all(
				files
					.filter((file) => file.endsWith('.js'))
					.map((file) => readFile(path.join(outDir, file), 'utf8'))
			)
		).join('\n');
		expect(javascript).toContain('Symbol.for(');
		expect(javascript).toContain('@exactjs/provided-packages');
		expect(javascript).not.toContain('createComponentInstance');

		const previous = (globalThis as Record<PropertyKey, unknown>)[
			Symbol.for('@exactjs/provided-packages')
		];
		(globalThis as Record<PropertyKey, unknown>)[Symbol.for('@exactjs/provided-packages')] = {
			require(key: string) {
				if (key !== '@exactjs/core') throw new Error(`unexpected provider ${key}`);
				return { createVNode: () => undefined };
			}
		};
		try {
			const loaded = (await import(pathToFileURL(path.join(outDir, entry!)).href)) as {
				default: { buildKey: string; root: string; component: unknown; registration: unknown };
			};
			expect(loaded.default).toMatchObject({
				buildKey,
				root: '@company/remote#./Area',
				registration: {}
			});
			expect(typeof loaded.default.component).toBe('function');
		} finally {
			if (previous === undefined)
				delete (globalThis as Record<PropertyKey, unknown>)[
					Symbol.for('@exactjs/provided-packages')
				];
			else
				(globalThis as Record<PropertyKey, unknown>)[Symbol.for('@exactjs/provided-packages')] =
					previous;
		}
	});
});

async function recursiveFiles(root: string, relative = ''): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
		const next = path.join(relative, entry.name);
		if (entry.isDirectory()) files.push(...(await recursiveFiles(root, next)));
		else files.push(next);
	}
	return files;
}
