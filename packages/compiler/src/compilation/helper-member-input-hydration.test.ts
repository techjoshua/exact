/** @vitest-environment jsdom */
import path from 'node:path';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import type { AnyComponentFunction } from '@exactjs/core';
import { hydrate } from '@exactjs/hydrate';
import { unmount } from '@exactjs/dom';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { expect, it } from 'vitest';
import { compileProjectArtifacts } from '../index.js';
import { artifactAnalysis } from './analysis-results.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(['member', 'indexed', 'literal', 'direct'] as const)(
	'retains child inputs in a component render (%s)',
	async (kind) => {
		const root = await createTestWorkspace('.exact-helper-member-input-', process.cwd());
		const input = {
			member: 'record.value',
			indexed: 'record["value"]',
			literal: '1',
			direct: 'record.value'
		}[kind];
		const files = await writeTestFiles(root, {
			'package.json': '{"name":"helper-member-input-fixture","type":"module"}',
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

			function Leaf(props: { value: number }) {
				return () => <output>{props.value}</output>;
			}
			function renderChild(record: { value: number }) {
				return <section><Leaf value={${input}} /></section>;
			}
			export function Workspace(this: Component<{ record: { value: number } }>) {
				this.state.record = { value: 1 };
				return () => <main>
					<button onClick={() => this.state.record.value++}>mutate</button>
					<button onClick={() => this.state.record = { value: this.state.record.value + 1 }}>replace</button>
					${kind === 'direct' ? '<section><Leaf value={this.state.record.value} /></section>' : '{renderChild(this.state.record)}'}
				</main>;
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
				packageType,
				packageName: 'helper-member-input-fixture'
			});
			const artifact = results.find((result) => result.inputFile === entry)!;
			const component = artifactAnalysis(artifact).components.find(
				({ name }) => name === 'Workspace'
			);
			const { id, placement, renderCapability, artifactTargets } = component!;
			facts.push({ id, placement, renderCapability, artifactTargets });
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
			const output = container.querySelector('output')!;
			expect(output.textContent).toBe('1');

			const client = await importArtifact(
				artifact.clientFile,
				path.join(root, packageType + '-client.mjs')
			);
			const reports: unknown[] = [];
			const page = client.Workspace as AnyComponentFunction;
			try {
				hydrate(createCompiledComponentInputReceipt(page, {}), container, {
					...composeExactComponentContracts([page], 'client'),
					resumptions: rendered.resumptions,
					onMismatch: 'throw',
					onErrorReport: (report) => reports.push(report)
				});
				expect(container.querySelector('button')).toBe(button);
				expect(container.querySelector('output')).toBe(output);
				for (const [index, next] of [
					[0, '2'],
					[1, '3'],
					[0, '4']
				] as const) {
					container.querySelectorAll('button')[index]!.click();
					flushSync();
					expect(container.querySelector('button')).toBe(button);
					expect(container.querySelector('output')).toBe(output);
					expect(output.textContent).toBe(kind === 'literal' ? '1' : next);
				}
				expect(reports).toEqual([]);
			} finally {
				unmount(container);
			}
		}
		expect(facts[0]).toEqual(facts[1]);
	}
);
