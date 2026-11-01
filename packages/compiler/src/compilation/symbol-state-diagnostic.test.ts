/** @vitest-environment jsdom */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { testComponent } from '@exactjs/testing';
import { createErrorContext, ErrorContext } from '@exactjs/core';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { hydrate } from '../../../hydrate/src/index.js';
import { compileProjectArtifacts, transformSource } from '../index.js';
import {
	createCompilerTestWorkspace,
	writeTestFiles,
	repositoryPath
} from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
const corpus = repositoryPath('packages/component-composition-corpus/test-support/symbol-state');
it('reports the authored snapshot key through the public SDK and rejects paired compilation', async () => {
	const root = await createCompilerTestWorkspace('.exact-symbol-state-', process.cwd());
	const source = await readFile(path.join(corpus, 'symbol.tsx'), 'utf8');
	const files = await writeTestFiles(root, { 'page.tsx': source });
	const options = {
		filename: files['page.tsx']!,
		serverComponents: true,
		componentContractProjection: 'hydrate' as const,
		generatedValidation: 'semantic' as const
	};
	expect(() => transformSource(source, { ...options, target: 'client' })).not.toThrow();
	expect(() => transformSource(source, { ...options, target: 'server' })).toThrow(
		/EXACT2232.*Symbol/s
	);
	await expect(
		compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated'),
			serverComponents: true
		})
	).rejects.toThrow('EXACT2232');
});
it('adopts a named-state correction and retains its button across two interactions', async () => {
	const root = await createCompilerTestWorkspace('.exact-symbol-named-', process.cwd());
	const files = await writeTestFiles(root, {
		'page.tsx': await readFile(path.join(corpus, 'named.tsx'), 'utf8')
	});
	const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const output = await renderToHydratableString(receipt(server.Probe as never, {}));
	const host = document.createElement('div');
	host.innerHTML = output.html;
	const button = host.querySelector('button')!;
	const reports: unknown[] = [];
	const mounted = hydrate(receipt(client.Probe as never, {}), host, {
		...composeExactComponentContracts([client.Probe as never], 'client'),
		resumptions: output.resumptions,
		onMismatch: 'throw',
		onErrorReport: (report) => reports.push(report)
	});
	try {
		expect(host.querySelector('button')).toBe(button);
		expect(button.textContent).toBe('0');
		for (const count of [1, 2]) {
			button.click();
			flushSync();
			expect(button.textContent).toBe(String(count));
			expect(host.querySelector('button')).toBe(button);
		}
		expect(reports).toEqual([]);
	} finally {
		mounted.dispose();
	}
	expect(host.childNodes).toHaveLength(0);
	expect(reports).toEqual([]);
});
it('renders static symbol-keyed state without demanding an island snapshot', async () => {
	const root = await createCompilerTestWorkspace('.exact-symbol-static-', process.cwd());
	const files = await writeTestFiles(root, {
		'page.tsx': `import type {Component} from '@exactjs/core';const key:unique symbol=Symbol('entry');export function Probe(this:Component<{[key]:number}>){this.state[key]=7;return()=> <output>{this.state[key]}</output>;}`
	});
	const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated'),
		serverComponents: true
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const output = await renderToHydratableString(receipt(server.Probe as never, {}));
	const host = document.createElement('div');
	host.innerHTML = output.html;
	expect(host.querySelector('output')?.textContent).toBe('7');
});
it('admits an explicitly client-local symbol component in a paired artifact', async () => {
	const root = await createCompilerTestWorkspace('.exact-symbol-client-', process.cwd());
	const files = await writeTestFiles(root, {
		'page.tsx': await readFile(path.join(corpus, 'client-only.tsx'), 'utf8')
	});
	const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated'),
		serverComponents: true
	});
	expect(artifact!.client.code.length).toBeGreaterThan(0);
	expect(artifact!.server.code.length).toBeGreaterThan(0);
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const reports = createErrorContext();
	const view = await testComponent(client.Probe as never)
		.context(ErrorContext, reports)
		.mount();
	try {
		const state = view.root.state();
		const keys = Object.getOwnPropertySymbols(state);
		expect(keys).toHaveLength(1);
		const key = keys[0]!;
		const button = view.container.querySelector('button');
		expect(Reflect.get(state, key)).toBe(0);
		for (const count of [1, 2]) {
			await view.root.getByRole('button').click();
			expect(Reflect.get(state, key)).toBe(count);
			expect(view.root.state()).toBe(state);
			expect(view.container.querySelector('button')).toBe(button);
		}
		expect(reports.errors).toEqual([]);
	} finally {
		view.unmount();
	}
	expect(view.container.childNodes).toHaveLength(0);
	expect(reports.errors).toEqual([]);
});
it('admits imported client child state while retaining the parent server artifact', async () => {
	const root = await createCompilerTestWorkspace('.exact-symbol-child-', process.cwd());
	const child = await readFile(path.join(corpus, 'client-only.tsx'), 'utf8');
	const files = await writeTestFiles(root, {
		'child.tsx': child,
		'page.tsx': "import {Probe} from './child.js';export function Page(){return()=> <Probe/>;}"
	});
	const artifacts = await compileProjectArtifacts([files['page.tsx']!, files['child.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated'),
		serverComponents: true
	});
	expect(artifacts).toHaveLength(2);
	for (const artifact of artifacts) expect(artifact.server.code.length).toBeGreaterThan(0);
});
