/** @vitest-environment jsdom */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { renderToString, renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from '@exactjs/hydrate';
import { render, unmount } from '@exactjs/dom';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each([
	{ namespace: 'core', alias: false },
	{ namespace: 'Core', alias: false },
	{ namespace: 'core', alias: true }
])(
	'retains namespace JSX identity through hydration ($namespace, alias=$alias)',
	async ({ namespace, alias }) => {
		const tag = alias ? 'Wrapper' : namespace + '.Fragment';
		const root = await createTestWorkspace('.exact-namespace-jsx-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		await writeFile(
			entry,
			`import * as ${namespace} from '@exactjs/core';
${alias ? 'const Wrapper=' + namespace + '.Fragment;' : ''}
export function Page(this: ${namespace}.Component<{count:number}>) {
 this.state.count=0;
 return () => <${tag}><input value="original"/><button onClick={()=>this.state.count++}>Count {this.state.count}</button><custom-element>Control</custom-element></${tag}>;
}`
		);
		const artifacts = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const page = artifacts.find((artifact) => artifact.inputFile === entry)!;
		const server = await importArtifact(page.serverFile, path.join(root, 'server.mjs'));
		const client = await importArtifact(page.clientFile, path.join(root, 'client.mjs'));
		const output = await renderToHydratableString(receipt(server.Page as never, {}));
		expect(output.html).toContain('<input');
		expect(output.html).not.toContain(`${namespace}.Fragment`);
		const container = document.createElement('div');
		container.innerHTML = output.htmlWithHydration;
		const input = container.querySelector('input')!;
		const button = container.querySelector('button')!;
		input.value = 'edited before hydration';
		const errors: unknown[] = [];
		const view = hydrate(receipt(client.Page as never, {}), container, {
			onErrorReport: (report) => errors.push(report.error)
		});
		onTestFinished(() => view.dispose());
		await view.whenSettled();
		expect(errors).toEqual([]);
		expect(container.querySelector('input')).toBe(input);
		expect(input.value).toBe('edited before hydration');
		button.click();
		await Promise.resolve();
		expect(button.textContent).toBe('Count 1');
		expect(container.querySelector('button')).toBe(button);
		expect(container.querySelector('custom-element')?.textContent).toBe('Control');
		button.click();
		await Promise.resolve();
		expect(button.textContent).toBe('Count 2');
		view.dispose();
		button.click();
		await Promise.resolve();
		expect(button.textContent).toBe('Count 2');
		expect(errors).toEqual([]);
	}
);

it('executes imported raw HTML capabilities in their matching runtimes', async () => {
	const root = await createTestWorkspace('.exact-host-capability-', process.cwd());
	const entry = path.join(root, 'article.tsx');
	await writeFile(
		entry,
		`import {unsafeHtml as raw} from '@exactjs/core';import * as core from '@exactjs/core';export function Article(){return ()=> <main>{raw('<b>head</b>')}{core.unsafeHtml('<i>tail</i>')}</main>;}`
	);
	const artifacts = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated'),
		packageType: 'application',
		capabilityPolicy: { unsafeHtml: { enabled: true } }
	});
	const article = artifacts.find((artifact) => artifact.inputFile === entry)!;
	expect(await readFile(article.clientFile, 'utf8')).toContain(
		'import "@exactjs/dom/runtime/unsafe-html"'
	);
	expect(await readFile(article.serverFile, 'utf8')).not.toContain(
		'@exactjs/dom/runtime/unsafe-html'
	);
	const server = await importArtifact(article.serverFile, path.join(root, 'server.mjs'));
	const client = await importArtifact(article.clientFile, path.join(root, 'client.mjs'));
	const output = await renderToString(receipt(server.Article as never, {}), {
		allowUnsafeHtml: true
	});
	expect(output.html).toContain('<b>head</b>');
	expect(output.html).toContain('<i>tail</i>');
	const container = document.createElement('div');
	onTestFinished(() => {
		unmount(container);
	});
	render(receipt(client.Article as never, {}), container, { allowUnsafeHtml: true });
	expect(container.querySelector('b')?.textContent).toBe('head');
	expect(container.querySelector('i')?.textContent).toBe('tail');
	unmount(container);
	expect(container.childNodes).toHaveLength(0);
});
