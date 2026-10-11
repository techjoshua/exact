/// <reference lib="es2023.intl" />
/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { Component } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, dispose } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { compileFileArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it('preserves formatter reuse, detached calls and dynamic locales in paired artifacts', async () => {
	const root = await createTestWorkspace('.exact-intl-cache-semantics-', process.cwd());
	const files = await writeTestFiles(root, {
		'page.tsx': `import {type Component} from '@exactjs/core';
const globalFormat=new Intl.NumberFormat('en-US',{useGrouping:false});
/** @exact pure */ function globalLabel(value:number){return globalFormat.format(value)}
export let owner:Component<{value:number,end:number,locale:string}>;
export function Page(this:Component<{value:number,end:number,locale:string}>){
 owner=this;this.state.value=1;this.state.end=2;this.state.locale='en-US';
 const reused=new Intl.NumberFormat('en-US',{minimumFractionDigits:2}),suffix='!';
 const escaped=new Intl.NumberFormat('en-US',{useGrouping:false});const alias=escaped;
 const detached=new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format;
 return()=> <output>{reused.format(this.state.value)+suffix}:{reused.format(this.state.end)}:{alias.format(this.state.value)}:{detached(this.state.value)}:{globalLabel(this.state.value)}:{new Intl.NumberFormat(this.state.locale).format(this.state.value)}:{new Intl.NumberFormat('en-US').formatRange(this.state.value,this.state.end)}</output>;
}`
	});
	const compiled = await compileFileArtifacts(files['page.tsx']!, { rootDir: root, outDir: root });
	const client = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
	const server = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
	const expected = (value: number, end: number, locale: string) =>
		[
			new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(value) + '!',
			new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(end),
			new Intl.NumberFormat('en-US', { useGrouping: false }).format(value),
			new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value),
			new Intl.NumberFormat('en-US', { useGrouping: false }).format(value),
			new Intl.NumberFormat(locale).format(value),
			new Intl.NumberFormat('en-US').formatRange(value, end)
		].join(':');
	for (const mode of ['mount', 'hydrate']) {
		const host = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => {
			dispose(host, true);
		});
		if (mode === 'hydrate') {
			const output = await renderToHydratableString(receipt(server.Page as never, {}));
			host.innerHTML = output.html;
			const initial = host.querySelector('output');
			expect(initial?.textContent).toBe(expected(1, 2, 'en-US'));
			hydrate(receipt(client.Page as never, {}), host, {
				resumptions: output.resumptions,
				onMismatch: 'throw',
				onErrorReport: (report) => reports.push(report)
			});
			expect(host.querySelector('output')).toBe(initial);
		} else
			render(receipt(client.Page as never, {}), host, { onErrorReport: (r) => reports.push(r) });
		const output = host.querySelector('output');
		expect(output?.textContent).toBe(expected(1, 2, 'en-US'));
		const owner = client.owner as Component<{ value: number; end: number; locale: string }>;
		for (const [value, end, locale] of [
			[1234.5, 2345.5, 'de-DE'],
			[3, 7, 'en-US'],
			[0, 1, 'fr-FR']
		] as const) {
			owner.state.value = value;
			owner.state.end = end;
			owner.state.locale = locale;
			flushSync();
			expect(output?.textContent, mode).toBe(expected(value, end, locale));
			expect(host.querySelector('output')).toBe(output);
		}
		dispose(host, true);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	}
});
