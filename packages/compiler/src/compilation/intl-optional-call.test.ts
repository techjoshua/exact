/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { type Component } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, dispose } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { compileFileArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it('preserves absent receivers and skipped formatter arguments through paired updates', async () => {
	const root = await createTestWorkspace('.exact-intl-optional-', process.cwd());
	const files = await writeTestFiles(root, {
		'page.tsx': `import {type Component} from '@exactjs/core';
export let reads=0;/** @exact pure */ function locale(){reads++;return 'en-US'}
export let owner:Component<{date:Date|null,nested:{date:Date}|null}>;
export function Page(this:Component<{date:Date|null,nested:{date:Date}|null}>){owner=this;this.state.date=null;this.state.nested=null;
return()=> <output>{this.state.date?.toLocaleString('en-US')}|{this.state.date?.toLocaleDateString('en-US')}|{this.state.date?.toLocaleTimeString('en-US')}|{this.state.nested?.date.toLocaleString('en-US')}|{this.state.date?.toLocaleString(locale())}</output>;}`
	});
	const compiled = await compileFileArtifacts(files['page.tsx']!, { rootDir: root, outDir: root });
	const client = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
	const server = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
	for (const mode of ['mount', 'hydrate']) {
		const host = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => {
			dispose(host, true);
		});
		const before = client.reads;
		if (mode === 'hydrate') {
			const output = await renderToHydratableString(receipt(server.Page as never, {}));
			host.innerHTML = output.html;
			const initial = host.querySelector('output');
			hydrate(receipt(client.Page as never, {}), host, {
				resumptions: output.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r)
			});
			expect(host.querySelector('output')).toBe(initial);
			expect(server.reads).toBe(0);
		} else
			render(receipt(client.Page as never, {}), host, { onErrorReport: (r) => reports.push(r) });
		const output = host.querySelector('output')!;
		expect(output).not.toBeNull();
		expect(output.textContent).toBe('||||');
		expect(client.reads).toBe(before);
		const owner = client.owner as Component<{ date: Date | null; nested: { date: Date } | null }>;
		for (const date of [new Date(0), null, new Date(86400000), null]) {
			const reads = client.reads;
			owner.state.date = date;
			owner.state.nested = date ? { date } : null;
			flushSync();
			const text = date
				? [
						date.toLocaleString('en-US'),
						date.toLocaleDateString('en-US'),
						date.toLocaleTimeString('en-US'),
						date.toLocaleString('en-US'),
						date.toLocaleString('en-US')
					].join('|')
				: '||||';
			expect(output.textContent).toBe(text);
			expect(host.querySelector('output')).toBe(output);
			if (!date) {
				flushSync();
				expect(client.reads).toBe(reads);
			}
		}
		dispose(host, true);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	}
});
