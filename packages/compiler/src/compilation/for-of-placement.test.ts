/** @vitest-environment node */
import path from 'node:path';
import { expect, it } from 'vitest';
import type { AnyStateAuthoredComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { renderToString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { createBrowserTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each([
	{ name: 'authored getter', label: 'get label(){return document.title}', readsBrowser: true },
	{ name: 'plain element', label: "label:'nested'", readsBrowser: false }
])(
	'renders a recursive array loop with $name on its supported target',
	async ({ label, readsBrowser }) => {
		const root = await createBrowserTestWorkspace('.exact-for-of-placement-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `import type { Component } from '@exactjs/core';
type Node = {label: string; children?: Node[]};
function labelTree(nodes: readonly Node[]): string {
  let result = '';
  for (const node of nodes) {
    result += node.label;
    if (node.children) result += labelTree(node.children);
  }
  return result;
}
export function Page(this: Component<{}>) {
  return () => <p>{labelTree([{label:'outer ', children:[{${label}}]}])}</p>;
}`
		});
		const [pair] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const mod = await importArtifact(pair!.serverFile, path.join(root, 'server.mjs'));
		const page = mod.Page as AnyStateAuthoredComponentFunction<Record<string, never>>;
		let reads = 0;
		const prior = Object.getOwnPropertyDescriptor(globalThis, 'document');
		Object.defineProperty(globalThis, 'document', {
			configurable: true,
			get() {
				reads++;
				return { title: 'browser-only title' };
			}
		});
		try {
			const { html } = await renderToString(createCompiledComponentInputReceipt(page, {}));
			expect(reads).toBe(0);
			expect(html.includes('exact:client-boundary:')).toBe(readsBrowser);
			if (!readsBrowser) expect(html).toContain('<p>outer nested</p>');
		} finally {
			if (prior) Object.defineProperty(globalThis, 'document', prior);
			else Reflect.deleteProperty(globalThis, 'document');
		}
	}
);
