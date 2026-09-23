/** @vitest-environment jsdom */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type Rollup } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { exact } from './index.js';

it('authorizes packaged motion and retains enhanced markup through SSR and hydration', async () => {
	const root = await mkdtemp(path.resolve('.tmp/motion-ssr-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	await mkdir(path.join(root, 'out'));
	await writeFile(
		path.join(root, 'page.tsx'),
		`
import { type Component } from '@exactjs/core';
import motion from '@exactjs/motion' with { type: 'exact-enhancement' };
import { fade } from '@exactjs/motion/presets';
export function Page(this: Component<{ value: number }>) {
 this.state.value = 7;
 return () => <article><button onClick={() => this.state.value++}>Add</button><strong motion:change={fade.enter}>{this.state.value}</strong><p motion:apply={fade}>panel</p><ul motion:change={fade.enter}><li>finding</li></ul></article>;
}
`
	);
	await writeFile(
		path.join(root, 'server.tsx'),
		`import {Page} from './page.js'; import {renderToHydratableString} from '@exactjs/ssr'; export const renderPage = () => renderToHydratableString(<Page/>);`
	);
	await writeFile(
		path.join(root, 'client.tsx'),
		`import {Page} from './page.js'; import {hydrate} from '@exactjs/hydrate'; export const mountPage = (root: Element) => hydrate(<Page/>, root);`
	);
	for (const target of ['server', 'client'] as const) {
		const entry = path.join(root, `${target}.tsx`);
		const result = (await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [exact({ applicationRoot: root, target, reactCompatibility: false })],
			build: {
				write: false,
				minify: false,
				ssr: target === 'server' ? entry : false,
				lib: { entry, formats: ['es'] },
				rollupOptions: { output: { inlineDynamicImports: true } }
			},
			ssr: { noExternal: true }
		})) as Rollup.RollupOutput | Rollup.RollupOutput[];
		const outputs = (Array.isArray(result) ? result : [result]).flatMap((output) => output.output);
		const chunk = outputs.find((output) => output.type === 'chunk' && output.isEntry);
		if (!chunk || chunk.type !== 'chunk') throw new Error('Missing motion entry bundle');
		await writeFile(path.join(root, 'out', `${target}.mjs`), chunk.code);
	}
	const server = await import(
		/* @vite-ignore */ pathToFileURL(path.join(root, 'out/server.mjs')).href
	);
	const client = await import(
		/* @vite-ignore */ pathToFileURL(path.join(root, 'out/client.mjs')).href
	);
	const rendered = await server.renderPage();
	const container = document.createElement('main');
	container.innerHTML = rendered.htmlWithHydration;
	expect(container.querySelector('strong')?.textContent).toBe('7');
	expect(container.querySelector('p')?.textContent).toBe('panel');
	expect(container.querySelector('li')?.textContent).toBe('finding');
	const strong = container.querySelector('strong');
	const mounted = client.mountPage(container);
	onTestFinished(() => mounted.dispose());
	await mounted.whenSettled();
	expect(container.querySelector('strong')).toBe(strong);
	container.querySelector('button')!.click();
	await expect.poll(() => strong?.textContent).toBe('8');
}, 30_000);
