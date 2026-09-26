/** @vitest-environment jsdom */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { renderToHydratableString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { artifactAnalysis } from './analysis-results.js';
import { importArtifact } from '../test-support/import-artifact.js';

// Equivalent parameter annotations must not change a plain JSX helper's export surface.
it.each([
	['inline-props', '', 'props: { text: string }', 'props.text'],
	['inline-box', '', 'box: { text: string }', 'box.text'],
	['destructured', '', '{ text }: { text: string }', 'text'],
	['named-type', 'export type BoxModel = { text: string };', 'box: BoxModel', 'box.text'],
	['interface', 'export interface BoxModel { text: string }', 'box: BoxModel', 'box.text']
] as const)(
	'preserves %s helper exports in paired artifacts',
	async (_name, declaration, parameter, expression) => {
		const root = await createTestWorkspace('.exact-inline-helper-', process.cwd());
		const entry = path.join(root, 'index.tsx');
		await writeTestFiles(root, {
			'tsconfig.json': JSON.stringify({
				compilerOptions: { jsx: 'preserve', module: 'ESNext', moduleResolution: 'Bundler' },
				include: ['*.tsx', 'setup.ts']
			}),
			'setup.ts': 'process.env.EXACT_HELPER_TEST = "fixture"; export {};'
		});
		await writeFile(
			path.join(root, 'exact.config.ts'),
			`export * as theme from '@exactjs/theme/enhancements' with { type: 'exact-enhancement', scope: 'package' }; export default {};`
		);
		for (const themed of [false, true]) {
			await writeFile(
				entry,
				`${declaration}export function renderLabBox(${parameter}) { return <p${themed ? ' theme:text="body"' : ''}>{${expression}}</p>; }`
			);
			const results = await compileProjectArtifacts([entry], {
				rootDir: root,
				outDir: path.join(root, 'out'),
				serverComponents: true
			});
			const artifact = results.find((result) => result.inputFile === entry)!;
			for (const target of ['clientFile', 'serverFile'] as const) {
				const source = ts.createSourceFile(
					artifact[target],
					await readFile(artifact[target], 'utf8'),
					ts.ScriptTarget.Latest,
					true
				);
				const exported = source.statements
					.filter(ts.isFunctionDeclaration)
					.find((statement) => statement.name?.text === 'renderLabBox');
				expect(exported, `${target}, themed=${themed}`).toBeDefined();
				expect(
					exported?.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
				).toBe(true);
			}
		}
	}
);

it.each([false, true])(
	'executes imported inline-type JSX helpers (serverComponents=%s)',
	async (serverComponents) => {
		const root = await createTestWorkspace('.exact-helper-consumer-', process.cwd());
		const files = await writeTestFiles(root, {
			'tsconfig.json': JSON.stringify({
				compilerOptions: { jsx: 'preserve', module: 'ESNext', moduleResolution: 'Bundler' },
				include: ['*.tsx', 'setup.ts']
			}),
			'setup.ts': 'process.env.EXACT_HELPER_TEST = "fixture"; export {};',
			'helper.tsx':
				'export function renderLabBox(box: { text: string }) { return <p>{box.text}</p>; }',
			'Page.tsx': `import type { Component } from '@exactjs/core';
import { renderLabBox } from './helper.js';
export function Page(this: Component<{ text: string }>) {
 this.state.text = 'initial';
 return () => <main>{renderLabBox({ text: this.state.text })}<button onClick={() => this.state.text = 'updated'}>Update</button></main>;
}`
		});
		const results = await compileProjectArtifacts([files['Page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'out'),
			serverComponents
		});
		const page = results.find((result) => result.inputFile === files['Page.tsx'])!;
		const server = await importArtifact(page.serverFile, path.join(root, 'server.mjs'));
		const rendered = await renderToHydratableString(
			createCompiledComponentReceipt(server.Page as AnyComponentFunction, {})
		);
		const serverContainer = document.createElement('div');
		serverContainer.innerHTML = rendered.htmlWithHydration;
		expect(serverContainer.querySelector('p')?.textContent).toBe('initial');
		const client = await importArtifact(page.clientFile, path.join(root, 'client.mjs'));
		const container = document.createElement('div');
		onTestFinished(() => {
			unmount(container);
		});
		render(createCompiledComponentReceipt(client.Page as AnyComponentFunction, {}), container);
		expect(container.querySelector('p')?.textContent).toBe('initial');
		container.querySelector('button')!.click();
		await expect.poll(() => container.querySelector('p')?.textContent).toBe('updated');
	}
);

it.each(['process.cwd()', 'window.name'])(
	'does not borrow %s at the same offset in an unrelated module',
	async (effect) => {
		const root = await createTestWorkspace('.exact-call-owner-', process.cwd());
		const source = `export function Page() { const text = normal(); return () => <p>{text}</p>; } function normal() { return "ok"; }`;
		const files = await writeTestFiles(root, {
			'tsconfig.json': JSON.stringify({
				compilerOptions: { jsx: 'preserve', module: 'ESNext', moduleResolution: 'Bundler' },
				include: ['*.tsx']
			}),
			'aaa.tsx': source.replace('return "ok";', `return ${effect};`),
			'zzz.tsx': source
		});
		const results = await compileProjectArtifacts([files['zzz.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'out'),
			serverComponents: true
		});
		expect(
			artifactAnalysis(results[0]!).components.find((component) => component.name === 'Page')
				?.placement
		).toBe('isomorphic');
		expect(results[0]!.build.componentBuild.components).toEqual([
			expect.objectContaining({ placement: 'isomorphic', artifactTargets: ['client', 'server'] })
		]);
	}
);
