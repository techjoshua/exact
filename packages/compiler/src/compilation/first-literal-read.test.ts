/** @vitest-environment jsdom */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { renderToString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each([
	{
		name: 'plain computed lookup',
		body: "const key = 'probe' as 'probe'|'unused';return {probe:'owned',unused:'dormant'}[key];",
		value: 'owned',
		browser: false
	},
	{
		name: 'computed key getter',
		body: "const source={get key(){void document.title;return 'probe' as const;}};return {probe:'owned'}[source.key];",
		value: 'owned',
		browser: true
	},
	{
		name: 'temporary changed during computed key evaluation',
		body: "let self: {probe:string}; function key(){self.probe=document.title;return 'probe' as const;}return (self={probe:'before'})[key()];",
		value: 'browser title',
		browser: true
	},
	{
		name: 'own computed name evaluation',
		body: "function name(){void document.title;return 'probe' as const;}return {[name()]:'owned'}.probe;",
		value: 'owned',
		browser: true
	},
	{
		name: 'object spread getter before the read',
		body: 'const source={get probe(){return document.title}};return {...source}.probe;',
		value: 'browser title',
		browser: true
	},
	{
		name: 'fresh array entries',
		body: "return [...['first','last'].entries()][1]![1];",
		value: 'last',
		browser: false
	},
	{
		name: 'saved array entries replacement',
		body: "const values=['first'];values.entries=function(){return [document.title].entries()};return [...values.entries()][0]![1];",
		value: 'browser title',
		browser: true
	},
	{
		name: 'authored inherited getter',
		setup: 'class Base{get probe(){return document.title}}class Holder extends Base{}',
		body: 'return new Holder().probe;',
		value: 'browser title',
		browser: true
	}
])('preserves $name at the original receiver read', async (test) => {
	const root = await createCompilerTestWorkspace('.exact-first-read-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`import {type Component} from '@exactjs/core';
${test.setup ?? ''}
/** @exact pure */
function calculate(){${test.body}}
export function Page(this:Component<{}>){const measured=this.reactive(()=>calculate());return()=> <p>{measured.get()}</p>;}`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const title = document.title;
	document.title = 'browser title';
	onTestFinished(() => {
		document.title = title;
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const { html } = await renderToString(receipt(server.Page as never, {}), { markers: false });
	if (test.browser) expect(html).toContain('data-exact-client-boundary=');
	else expect(html).toBe(`<p>${test.value}</p>`);

	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const host = document.createElement('div');
	onTestFinished(() => unmount(host));
	const errors: unknown[] = [];
	render(receipt(client.Page as never, {}), host, {
		onErrorReport: (report) => errors.push(report.error)
	});
	expect(errors).toEqual([]);
	expect(host.textContent).toBe(test.value);
});
