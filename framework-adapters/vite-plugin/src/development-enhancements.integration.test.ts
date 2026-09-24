import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { compileProjectArtifacts } from '@exactjs/compiler';
import { exact } from './index.js';

const workspace = fileURLToPath(new URL('../../../', import.meta.url));

it.each(['authored', 'paired'] as const)(
	'development SSR registers installed theme renderers (%s)',
	async (mode) => {
		await mkdir(path.join(workspace, '.tmp'), { recursive: true });
		const root = await mkdtemp(path.join(workspace, '.tmp/dev-enhancements-'));
		onTestFinished(() => rm(root, { recursive: true, force: true }));
		await writeFile(
			path.join(root, 'package.json'),
			'{"name":"development-enhancements","type":"module","private":true}'
		);
		// Physical packages are externalized by Vite by default; workspace links are not.
		const copied = new Set<string>();
		/** Copy installed runtime files without workspace symlinks masking externalization. */
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
			if (manifest.files?.includes('dist'))
				await cp(path.join(source, 'dist'), path.join(destination, 'dist'), { recursive: true });
			for (const dependency of Object.keys(manifest.dependencies ?? {}))
				if (dependency.startsWith('@exactjs/')) await copyPackage(dependency);
		}
		await copyPackage('@exactjs/theme');
		await copyPackage('@exactjs/jsx');
		await writeFile(
			path.join(root, 'exact.config.mjs'),
			`export * as theme from '@exactjs/theme/enhancements' with { type: 'exact-enhancement', scope: 'package' }; export default {};`
		);
		await writeFile(
			path.join(root, 'Page.tsx'),
			`/** @exact server */
export function Page() { return () => <section theme:scope theme:appearance="dark"><input theme:field aria-label="Draft" /></section>; }`
		);
		if (mode === 'paired')
			await compileProjectArtifacts([path.join(root, 'Page.tsx')], {
				rootDir: root,
				outDir: path.join(root, 'generated'),
				serverComponents: true
			});
		await writeFile(
			path.join(root, 'entry.tsx'),
			`import { Page } from '${mode === 'paired' ? './generated/Page.exact.server.js' : './Page.js'}';
import {renderToString} from '@exactjs/ssr';
export const render = () => renderToString(<Page />);`
		);
		const vite = await createServer({
			root,
			configFile: false,
			appType: 'custom',
			logLevel: 'silent',
			plugins: [
				exact({ applicationRoot: root, serverComponents: true, reactCompatibility: false })
			],
			server: { middlewareMode: true, watch: null }
		});
		try {
			for (let generation = 0; generation < 2; generation++) {
				const { render } = await vite.ssrLoadModule('/entry.tsx');
				const { html } = await render();
				expect(html).toContain('data-exact-theme=');
				expect(html).toContain('exact-theme-field');
				vite.moduleGraph.invalidateAll();
			}
		} finally {
			await vite.close();
		}
	},
	30_000
);
