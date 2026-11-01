/** @vitest-environment jsdom */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { analyzeSource } from './source-analysis.js';
it.each([
	{
		name: 'captured factory input',
		definitions: `function make(input:{value:string}){return {get value(){return input.value}}}`,
		body: `const value=make({get value(){return window.location.href}}).value;`
	},
	{
		name: 'delayed captured getter',
		definitions: `function make(input:{value:string}){return {get value(){return input.value}}}`,
		body: `const box=make({get value(){return window.location.href}});const value=box.value;`
	},
	{
		name: 'returned ordinary closure',
		definitions: `function make(input:{value:string}){return function read(){return input.value}}`,
		body: `const read=make({get value(){return window.location.href}});const value=read();`
	},
	{
		name: 'sibling live replacement',
		definitions: `function make(input:{value:string}){return {get value(){return input.value},replace(next:{value:string}){input=next}}}`,
		body: `const safe=make({value:'safe'});const box=make({value:'old'});box.replace({get value(){return window.location.href}});const value=box.value;`
	},
	{
		name: 'external member alias',
		definitions: `function make(input:{inner:{value:string}}){return {get value(){return input.inner.value}}}`,
		body: `const input={inner:{value:'safe'}};const box=make(input);const alias=input;alias.inner={get value(){return window.location.href}};const value=box.value;`
	},
	{
		name: 'conditional return',
		definitions: `function make(flag:boolean):{value:string}{return flag?{get value(){return window.location.href;}}:{value:'safe'};}`,
		body: `const value=make(true).value;`
	},
	{
		name: 'nested projection',
		definitions: `function make():{nested:{value:string}}{return {nested:{get value(){return window.location.href;}}};}`,
		body: `const value=make().nested.value;`
	},
	{
		name: 'mutable binding',
		definitions: ``,
		body: `let holder:{value:string}={value:'safe'};holder={get value(){return window.location.href;}};const value=holder.value;`
	},
	{
		name: 'inherited getter',
		definitions: `class Base{get value(){return window.location.href;}}class Holder extends Base{}`,
		body: `const holder:{value:string}=new Holder();const value=holder.value;`
	},
	{
		name: 'forwarded parameter',
		definitions: `function make():{value:string}{return {get value(){return window.location.href;}};}function read(holder:{value:string}){return holder.value;}function forward(holder:{value:string}){return read(holder);}`,
		body: `const value=forward(make());`
	},
	{
		name: 'implicit spread',
		definitions: `function make():{value:string}{return {get value(){return window.location.href;}};}`,
		body: `const value={...make()}.value;`
	},
	{
		name: 'nested destructure',
		definitions: `function make():{nested:{value:string}}{return {nested:{get value(){return window.location.href;}}};}`,
		body: `const {nested:{value}}=make();`
	}
])('executes $name in the emitted browser component', async ({ definitions, body }) => {
	const root = await createCompilerTestWorkspace('.exact-accessor-execution-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	const source = `${definitions}export function Page(){${body}return()=> <p>{value}</p>;}`;
	await writeFile(entry, source);
	expect(
		analyzeSource(source, { filename: entry, target: 'server' }).components[0]?.placement
	).toBe('client');
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const host = document.createElement('div');
	const reports: unknown[] = [];
	onTestFinished(() => {
		unmount(host);
	});
	render(receipt(client.Page as never, {}), host, {
		onErrorReport: (report) => reports.push(report.error)
	});
	expect(host.textContent).toBe(window.location.href);
	expect(reports).toEqual([]);
});
