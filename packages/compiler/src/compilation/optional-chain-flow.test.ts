/** @vitest-environment jsdom */
import { expect, it, onTestFinished } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import type { AnyComponentFunction, Component } from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';

// Erased read proofs must preserve the chain through an optional union member.
// Mount, strict adoption and retained updates protect more than semantic checking.
it.each(['member', 'literal element'])(
	'preserves optional non-null render flow through a %s',
	async (selector) => {
		const root = await createTestWorkspace('.exact-optional-flow-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		const expression =
			selector === 'member'
				? 'this.state.outer?.nested!.count'
				: 'this.state.outer?.["nested"]!["count"]';
		await writeFile(
			entry,
			`import {type Component} from '@exactjs/core';
export let owner:Component<{outer:{nested:{count:number}|undefined}|null}>;
export function Probe(this:typeof owner){owner=this;this.state.outer=null;return()=> <output>{String(${expression})}</output>;}`
		);
		const [artifact] = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		for (const mode of ['mount', 'hydrate']) {
			const host = document.createElement('div');
			onTestFinished(() => {
				unmount(host);
			});
			const reports: unknown[] = [];
			const component = client.Probe as AnyComponentFunction;
			let adopted: Element | null = null;
			if (mode === 'hydrate') {
				const output = await renderToHydratableString(
					receipt(server.Probe as AnyComponentFunction, {})
				);
				expect(output.html).toContain('undefined');
				host.innerHTML = output.html;
				adopted = host.querySelector('output');
				hydrate(receipt(component, {}), host, {
					...composeExactComponentContracts([component], 'client'),
					resumptions: output.resumptions,
					onMismatch: 'throw',
					onErrorReport: (report) => reports.push(report.error)
				});
			} else render(receipt(component, {}), host, { onErrorReport: (r) => reports.push(r.error) });
			const node = host.querySelector('output')!;
			expect(node).not.toBeNull();
			if (adopted) expect(node).toBe(adopted);
			const owner = client.owner as Component<{ outer: { nested: { count: number } } | null }>;
			for (const value of [null, 1, null, 2]) {
				owner.state.outer = value === null ? null : { nested: { count: value } };
				flushSync();
				expect(host.querySelector('output')).toBe(node);
				expect(node.textContent).toBe(value === null ? 'undefined' : String(value));
			}
			expect(reports).toEqual([]);
			unmount(host);
			owner.state.outer = { nested: { count: 3 } };
			flushSync();
			expect(host.childNodes.length).toBe(0);
		}
	}
);
