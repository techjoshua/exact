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
	{ name: 'unused index', entries: "['only'].entries()", value: 'safe', browser: false },
	{ name: 'empty native iterator', entries: '[].entries()', value: 'empty', browser: false },
	{
		name: 'first selected index',
		entries: "['only'].entries()",
		firstGetter: true,
		value: 'browser title',
		browser: true
	},
	{
		name: 'second selected index',
		entries: "['first','second'].entries()",
		value: 'browser title',
		browser: true
	},
	{
		name: 'growth before iteration',
		setup: "const array=['first'];array.push('second');",
		entries: 'array.entries()',
		value: 'browser title',
		browser: true
	},
	{
		name: 'growth during iteration',
		setup: "const array=['first'];",
		entries: 'array.entries()',
		step: "if(index===0)array.push('second');",
		value: 'browser title',
		browser: true
	},
	{
		name: 'an authored entries method',
		setup: "const array=['first'];array.entries=()=>['first','second'].entries();",
		entries: 'array.entries()',
		value: 'browser title',
		browser: true
	},
	{
		name: 'an authored iterator replacement',
		setup:
			"const iterator=['first'].entries();Object.defineProperty(iterator,Symbol.iterator,{value:function*(){yield [1,'second'];}});",
		entries: 'iterator',
		value: 'browser title',
		browser: true
	}
])('retains the executed property read for $name', async (test) => {
	const root = await createCompilerTestWorkspace('.exact-array-entries-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	const fields = test.firstGetter
		? "get 0(){return document.title},1:'unused'"
		: "0:'safe',get 1(){return document.title}";
	await writeFile(
		entry,
		`import {type Component} from '@exactjs/core';
/** @exact pure */
function calculate() {
	const table:Record<number,string>={${fields}};
	${test.setup ?? ''}
	let selected='empty';
	for(const [index] of ${test.entries}) {
		${test.step ?? ''}
		selected=table[index]!;
	}
	return selected;
}
export function Page(this:Component<{}>) {
	const selected=this.reactive(()=>calculate());
	return () => <p>{selected.get()}</p>;
}`
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
