/** @vitest-environment jsdom */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { renderToHydratableString } from '@exactjs/ssr';
import { hydrate } from '@exactjs/hydrate';
import { render, unmount } from '@exactjs/dom';
import { flushSync, reactive } from '@exactjs/reactive';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
it.each([
	{ namespace: 'core', alias: false },
	{ namespace: 'Core', alias: false },
	{ namespace: 'core', alias: true }
])(
	'retains namespace JSX identity through hydration ($namespace, alias=$alias)',
	async ({ namespace, alias }) => {
		const tag = alias ? 'Wrapper' : namespace + '.Fragment';
		const root = await createCompilerTestWorkspace('.exact-namespace-jsx-', process.cwd());
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
	const root = await createCompilerTestWorkspace('.exact-host-capability-', process.cwd());
	const entry = path.join(root, 'article.tsx');
	await writeFile(
		entry,
		`import {unsafeHtml as raw} from '@exactjs/core';import * as core from '@exactjs/core';export function Article(props:{html:string}){return ()=> <main><span data-role="retained">retained</span>{raw('<b>head</b>')}{core.unsafeHtml(props.html)}</main>;}`
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
	const state = reactive({ html: '<i data-role="html">before</i>' });
	await expect(renderToHydratableString(receipt(server.Article as never, state))).rejects.toThrow(
		'allowUnsafeHtml'
	);
	const output = await renderToHydratableString(receipt(server.Article as never, state), {
		allowUnsafeHtml: true
	});
	expect(output.html).toContain('<b>head</b>');
	expect(output.html).toContain('<i data-role="html">before</i>');
	for (const entry of ['mount', 'hydrate'] as const) {
		const container = document.createElement('div');
		let view: ReturnType<typeof hydrate> | undefined;
		onTestFinished(() => {
			if (view) view.dispose();
			else unmount(container);
			container.remove();
		});
		state.html = '<i data-role="html">before</i>';
		if (entry === 'hydrate') container.innerHTML = output.htmlWithHydration;
		const serverRetained = container.querySelector('[data-role="retained"]');
		const errors: unknown[] = [];
		if (entry === 'hydrate') {
			const outcomes: string[] = [];
			view = hydrate(receipt(client.Article as never, state), container, {
				allowUnsafeHtml: true,
				onMismatch: 'throw',
				onHydration: ({ outcome }) => outcomes.push(outcome),
				onErrorReport: (report) => errors.push(report.error)
			});
			await view.whenSettled();
			expect(outcomes).toEqual(['adopted']);
			expect(container.querySelector('[data-role="retained"]')).toBe(serverRetained);
		} else render(receipt(client.Article as never, state), container, { allowUnsafeHtml: true });
		const retained = container.querySelector('[data-role="retained"]');
		expect(retained?.textContent).toBe('retained');
		expect(container.querySelector('b')?.textContent).toBe('head');
		expect(container.querySelector('[data-role="html"]')?.textContent).toBe('before');
		state.html = '<i data-role="html">after</i>';
		render(receipt(client.Article as never, state), container, { allowUnsafeHtml: true });
		flushSync();
		expect(container.querySelector('[data-role="html"]')?.textContent).toBe('after');
		expect(container.querySelector('[data-role="retained"]')).toBe(retained);
		expect(errors).toEqual([]);
		if (view) view.dispose();
		else unmount(container);
		expect(container.querySelector('main')).toBeNull();
		if (!view) expect(container.childNodes).toHaveLength(0);
		state.html = '<i data-role="html">disposed</i>';
		flushSync();
		expect(container.querySelector('main')).toBeNull();
	}
});

it('copies component fallback inputs once while retaining local callbacks and keys', async () => {
	const root = await createCompilerTestWorkspace('.exact-local-component-inputs-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`
export function Child(props:{title?:string;onClick?:()=>void;key?:string}) {
 return()=> <button title={props.title} onClick={props.onClick}>Child</button>;
}
export function Page(props:{bag:{title?:string;onClick?:()=>void;key?:string}}) {
 return()=> <main><Child {...props.bag}/><Child key="explicit" {...props.bag}/></main>;
}`
	);
	const artifacts = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const page = artifacts.find((artifact) => artifact.inputFile === entry)!;
	const server = await importArtifact(page.serverFile, path.join(root, 'server.mjs'));
	const client = await importArtifact(page.clientFile, path.join(root, 'client.mjs'));
	const reads: string[] = [];
	let clicks = 0;
	const callback = () => clicks++;
	const callbacks: { current?: typeof callback } = {};
	const bag = {
		get title() {
			reads.push('title');
			return 'ready';
		},
		get onClick() {
			reads.push('onClick');
			return callbacks.current;
		},
		get key() {
			reads.push('key');
			return 'stable';
		}
	};
	const output = await renderToHydratableString(receipt(server.Page as never, { bag }));
	expect(reads).toEqual(['title', 'onClick', 'key', 'title', 'onClick', 'key']);
	expect(output.html.match(/<button/g)).toHaveLength(2);
	expect(output.html.match(/title="ready"/g)).toHaveLength(2);
	reads.length = 0;
	callbacks.current = callback;
	const container = document.createElement('div');
	const errors: unknown[] = [];
	render(receipt(client.Page as never, { bag }), container, {
		onErrorReport: (report) => errors.push(report.error)
	});
	onTestFinished(() => {
		unmount(container);
	});
	await Promise.resolve();
	expect(reads).toEqual(['title', 'onClick', 'key', 'title', 'onClick', 'key']);
	const buttons = container.querySelectorAll('button');
	expect(buttons).toHaveLength(2);
	buttons[0]!.click();
	await Promise.resolve();
	expect(clicks).toBe(1);
	expect(errors).toEqual([]);
	unmount(container);
	buttons[0]!.click();
	await Promise.resolve();
	expect(clicks).toBe(1);
	const failure = new Error('spread getter failed');
	const throwingBag = {
		get title(): string {
			reads.push('throw');
			throw failure;
		},
		get onClick() {
			reads.push('unreached');
			return callback;
		}
	};
	reads.length = 0;
	await expect(
		renderToHydratableString(receipt(server.Page as never, { bag: throwingBag }))
	).rejects.toThrow(failure);
	expect(reads).toEqual(['throw']);
});
