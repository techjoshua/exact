/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { render, unmount } from '@exactjs/dom';
import { renderToHydratableString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(["'", '`'])('emits and resolves deferred JSX modules using %s literals', async (quote) => {
	const root = await createTestWorkspace('.exact-lazy-artifacts-', process.cwd());
	const files = await writeTestFiles(root, {
		'entry.ts': `export async function load() { return (await import(${quote}./view.js${quote})).root; }`,
		'view.tsx': 'function View() { return () => <p>loaded</p>; } export const root = <View/>;'
	});
	const results = await compileProjectArtifacts([files['entry.ts']!], {
		rootDir: root,
		outDir: path.join(root, 'out')
	});
	expect(results.map((result) => path.basename(result.inputFile)).sort()).toEqual([
		'entry.ts',
		'view.tsx'
	]);
	const entry = results.find((result) => result.inputFile === files['entry.ts'])!;
	const client = await importArtifact(entry.clientFile, path.join(root, 'client.mjs'));
	const server = await importArtifact(entry.serverFile, path.join(root, 'server.mjs'));
	type Root = Parameters<typeof render>[0];
	const clientRoot = await (client.load as () => Promise<Root>)();
	const serverRoot = await (server.load as () => Promise<Root>)();
	const container = document.createElement('div');
	onTestFinished(() => {
		unmount(container);
	});
	render(clientRoot, container);
	expect(container.querySelector('p')?.textContent).toBe('loaded');
	const ssr = await renderToHydratableString(serverRoot);
	const html = document.createElement('div');
	html.innerHTML = ssr.htmlWithHydration;
	expect(html.querySelector('p')?.textContent).toBe('loaded');
});
