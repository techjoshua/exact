/** @vitest-environment jsdom */
import path from 'node:path';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import type { AnyComponentFunction } from '@exactjs/core';
import { hydrate } from '@exactjs/hydrate';
import { unmount } from '@exactjs/dom';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { expect, it } from 'vitest';
import { compileProjectArtifacts } from '../index.js';
import { artifactAnalysis } from './analysis-results.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it('hydrates the same state-reading render helper in application and library builds', async () => {
	const root = await createTestWorkspace('.exact-helper-state-', process.cwd());
	const files = await writeTestFiles(root, {
		'package.json': '{"name":"helper-state-fixture","type":"module"}',
		'tsconfig.json': JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'NodeNext',
				moduleResolution: 'NodeNext',
				jsx: 'preserve',
				jsxImportSource: '@exactjs/jsx',
				strict: true,
				skipLibCheck: true
			}
		}),
		'workspace.tsx': `
				import type { Component } from '@exactjs/core';
				import { renderItems } from './view.js';
				export function Workspace(this: Component<{ items: string[] }>) {
					this.state.items = ['one'];
					return () => renderItems(this.state, (received) => {
						if (received === this.state) {
							this.state.items = this.state.items[0] === 'one' ? ['two'] : ['three'];
						}
					});
				}
			`,
		'view.tsx': `
				export function renderItems(state: { items: string[] }, click: (received: { items: string[] }) => void) {
					return <button onClick={() => click(state)}>{state.items}</button>;
				}
			`
	});
	const entry = files['workspace.tsx']!;
	const facts = [];
	for (const packageType of ['application', 'library'] as const) {
		const outDir = path.join(root, packageType);
		const results = await compileProjectArtifacts([entry], {
			root,
			rootDir: root,
			outDir,
			serverComponents: true,
			packageType,
			packageName: 'helper-state-fixture',
			generatedValidation: 'semantic'
		});
		const artifact = results.find((result) => result.inputFile === entry)!;
		const [component] = artifactAnalysis(artifact).components;
		const { id, placement, renderCapability, artifactTargets } = component!;
		facts.push({ id, placement, renderCapability, artifactTargets });
		expect.soft(placement).toBe('isomorphic');
		expect.soft(component?.artifactTargets).toEqual(expect.arrayContaining(['server', 'client']));
		const server = await importArtifact(
			artifact.serverFile,
			path.join(root, packageType + '-server.mjs')
		);
		const rendered = await renderToHydratableString(
			createCompiledComponentInputReceipt(server.Workspace as AnyComponentFunction, {})
		);
		const container = document.createElement('div');
		container.innerHTML = rendered.html;
		const button = container.querySelector('button')!;
		expect(button.textContent).toBe('one');

		const client = await importArtifact(
			artifact.clientFile,
			path.join(root, packageType + '-client.mjs')
		);
		const reports: unknown[] = [];
		try {
			hydrate(
				createCompiledComponentInputReceipt(client.Workspace as AnyComponentFunction, {}),
				container,
				{
					resumptions: rendered.resumptions,
					onMismatch: 'throw',
					onErrorReport: (report) => reports.push(report)
				}
			);
			expect(container.querySelector('button')).toBe(button);
			for (const next of ['two', 'three']) {
				button.click();
				flushSync();
				expect(container.querySelector('button')).toBe(button);
				expect(button.textContent).toBe(next);
			}
			expect(reports).toEqual([]);
		} finally {
			unmount(container);
		}
	}
	expect(facts[0]).toEqual(facts[1]);
});
