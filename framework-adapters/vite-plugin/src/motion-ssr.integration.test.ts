import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build, type Rollup } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { exact } from './index.js';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '@exactjs/compiler';

it.each(['authored', 'paired', 'facade', 'absent', 'partitioned', 'partitioned-stream'] as const)(
	'retains enhancement linkage through SSR and hydration (%s)',
	async (mode) => {
		await mkdir(path.resolve('.tmp'), { recursive: true });
		const root = await mkdtemp(path.resolve('.tmp/motion-ssr-'));
		onTestFinished(() => rm(root, { recursive: true, force: true }));
		await mkdir(path.join(root, 'out'));
		if (mode === 'absent') {
			await mkdir(path.join(root, 'node_modules/@fixture'), { recursive: true });
			await symlink(
				fileURLToPath(new URL('../../../component-libraries/motion', import.meta.url)),
				path.join(root, 'node_modules/@fixture/motion'),
				'junction'
			);
		}

		await writeFile(
			path.join(root, 'page.tsx'),
			`
import { type Component } from '@exactjs/core';
import motion from '${mode === 'absent' ? '@fixture/motion' : '@exactjs/motion'}' with { type: 'exact-enhancement' };
import { fade } from '@exactjs/motion/presets';
export function Page(this: Component<{ value: number }>) {
 this.state.value = 7;
 return () => <article><button onClick={() => this.state.value++}>Add {this.state.value}</button><strong motion:change={fade.enter}>{this.state.value}</strong><p motion:apply={fade}>panel</p><ul motion:change={fade.enter}><li>finding</li></ul></article>;
}
`
		);
		if (mode !== 'authored') {
			const artifacts = await compileProjectArtifacts([path.join(root, 'page.tsx')], {
				rootDir: root,
				outDir: path.join(root, 'generated'),
				sourceMap: mode === 'paired',
				serverComponents: mode.startsWith('partitioned')
			});
			if (mode.startsWith('partitioned')) {
				const graph = createExactArtifactGraph(artifacts, {
					packageRoot: root,
					sourceRoot: root,
					rootDir: path.join(root, 'generated')
				});
				await writeFile(
					path.join(root, 'generated/registration.ts'),
					createExactHydrationRegistrationModule(graph)
				);
			}
		}
		if (mode === 'absent') await rm(path.join(root, 'node_modules/@fixture/motion'));
		const page = (target: string) =>
			mode === 'authored'
				? './page.js'
				: mode === 'facade'
					? './generated/page.exact'
					: `./generated/page.exact.${target}.ts`;
		await writeFile(
			path.join(root, 'server.tsx'),
			mode === 'partitioned-stream'
				? `import {Page} from '${page('server')}'; import {renderToHydratableProgressiveHtmlStream} from '@exactjs/ssr'; export const renderPage = async () => { let htmlWithHydration = ''; for await (const chunk of renderToHydratableProgressiveHtmlStream(<Page/>)) htmlWithHydration += chunk; return {htmlWithHydration}; };`
				: `import {Page} from '${page('server')}'; import {renderToHydratableString} from '@exactjs/ssr'; export const renderPage = () => renderToHydratableString(<Page/>);`
		);
		await writeFile(
			path.join(root, 'client.tsx'),
			mode.startsWith('partitioned')
				? `import {exactHydrationRegistration} from './generated/registration.js'; import {createExactClient} from '@exactjs/hydrate'; export const mountPage = (root: Element) => createExactClient(root, exactHydrationRegistration);`
				: `import {Page} from '${page('client')}'; import {hydrate} from '@exactjs/hydrate'; export const mountPage = (root: Element) => hydrate(<Page/>, root);`
		);
		for (const target of ['server', 'client'] as const) {
			const entry = path.join(root, `${target}.tsx`);
			const result = (await build({
				root,
				configFile: false,
				logLevel: 'silent',
				plugins: [
					exact({
						applicationRoot: root,
						target,
						reactCompatibility: false,
						serverComponents: mode.startsWith('partitioned')
					})
				],
				build: {
					write: false,
					minify: false,
					ssr: target === 'server' ? entry : false,
					lib: { entry, formats: ['es'] },
					rollupOptions: { output: { inlineDynamicImports: true } }
				},
				ssr: { noExternal: true }
			})) as Rollup.RollupOutput | Rollup.RollupOutput[];
			const outputs = (Array.isArray(result) ? result : [result]).flatMap(
				(output) => output.output
			);
			const chunk = outputs.find((output) => output.type === 'chunk' && output.isEntry);
			if (!chunk || chunk.type !== 'chunk') throw new Error('Missing motion entry bundle');
			expect(
				Object.keys(chunk.modules).some((id) => /motion[\\/]dist[\\/].*motion-element/.test(id))
			).toBe(mode !== 'absent');
			await writeFile(path.join(root, 'out', `${target}.mjs`), chunk.code);
		}
		const runner = fileURLToPath(
			new URL('./test-support/verify-motion-hydration.mjs', import.meta.url)
		);
		const checked = await promisify(execFile)(process.execPath, [runner, root]);
		expect(checked.stderr).toBe('');
	},
	30_000
);
