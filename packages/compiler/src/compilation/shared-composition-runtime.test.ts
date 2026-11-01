/** @vitest-environment jsdom */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createErrorContext, ErrorContext, type AnyComponentFunction } from '@exactjs/core';
import { testComponent } from '@exactjs/testing';
import { renderToString } from '@exactjs/ssr';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { compileProjectArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompilerTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

// Native Session witnesses establish placement separately. This test requires the
// actual paired output to render and a mounted consumer to retain its owner.
it('updates a container-carried capture on the same mounted component', async () => {
	const root = await createCompilerTestWorkspace('.exact-shared-composition-', process.cwd());
	const source = await readFile(
		path.resolve(import.meta.dirname, '../test-support/shared-composition.fixtures.tsx'),
		'utf8'
	);
	const files = await writeTestFiles(root, { 'page.tsx': source });
	const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const serverProps = {
		observe: (_lane: string, value: number) => value,
		mounted() {},
		disposed() {}
	};
	const html = await renderToString(receipt(server.SharedComposition as never, serverProps));
	const preview = document.createElement('div');
	preview.innerHTML = html.html;
	expect(preview.querySelector('[data-lane="affected"]')?.textContent).toBe('1');
	expect(preview.querySelector('[data-lane="unrelated"]')?.textContent).toBe('10');
	const calls = { affected: 0, unrelated: 0, mounted: 0, disposed: 0 };
	const errors = createErrorContext();
	const view = await testComponent(client.SharedComposition as AnyComponentFunction)
		.props({
			observe(lane: 'affected' | 'unrelated', value: number) {
				calls[lane]++;
				return value;
			},
			mounted() {
				calls.mounted++;
			},
			disposed() {
				calls.disposed++;
			}
		})
		.context(ErrorContext, errors)
		.mount();
	const instance = view.root.instance;
	const state = view.root.state();
	const affected = view.container.querySelector('[data-lane="affected"]');
	const unrelated = view.container.querySelector('[data-lane="unrelated"]');
	try {
		expect(affected?.textContent).toBe('1');
		expect(unrelated?.textContent).toBe('10');
		const unrelatedCalls = calls.unrelated;
		const affectedCalls = calls.affected;
		for (const count of [2, 3]) {
			await view.root.setState({ count });
			expect(affected?.textContent).toBe(String(count));
			expect(view.container.querySelector('[data-lane="affected"]')).toBe(affected);
			expect(view.container.querySelector('[data-lane="unrelated"]')).toBe(unrelated);
			expect(view.root.instance).toBe(instance);
			expect(view.root.state()).toBe(state);
			expect(calls.unrelated).toBe(unrelatedCalls);
		}
		expect(calls.affected).toBeGreaterThan(affectedCalls);
		expect(calls.mounted).toBe(1);
		expect(calls.disposed).toBe(0);
		expect(errors.errors).toEqual([]);
	} finally {
		await view.unmount();
	}
	expect(calls.disposed).toBe(1);
	expect(instance.scope.active).toBe(false);
	expect(view.container.childNodes).toHaveLength(0);
	expect(errors.errors).toEqual([]);
});

it.each([
	{ name: 'original projected call', rhs: 'document.title', browser: true },
	{ name: 'safe RHS control', rhs: '"safe replacement"', browser: false }
])('executes the paired $name without replaying its original call', async ({ rhs, browser }) => {
	const root = await createCompilerTestWorkspace('.exact-shared-module-', process.cwd());
	// Keep the original expression and its invocation intact. The portable export
	// observes that the paired server module remains usable after target projection.
	const source = `function make(input:{value:string}){return ()=>input.value}const input={value:"safe"};const xs=[make(input)];input.value=${rhs};export const value=xs[0]!();export const stable="stable";`;
	const files = await writeTestFiles(root, { 'entry.ts': source });
	const [artifact] = await compileProjectArtifacts([files['entry.ts']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	document.title = 'captured browser title';
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	expect(client.value).toBe(browser ? document.title : 'safe replacement');
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	expect(server.stable).toBe('stable');
	if (browser) expect(server).not.toHaveProperty('value');
	else expect(server.value).toBe('safe replacement');
});
