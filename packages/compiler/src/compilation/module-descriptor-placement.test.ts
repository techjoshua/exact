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

const storedCallback =
	'Object.defineProperty({value:()=>"before"},"value",{value:()=>document.title})';
const createdCallback =
	'Object.defineProperty(Object.create(null),"value",{value:()=>document.title})';
const definitionMap = (entry: string) => `Object.defineProperties({value:"before"},{${entry}})`;

it.each([
	{
		name: 'a data value with the same key as the descriptor field',
		declaration: 'const record = Object.defineProperty({value:"before"},"value",{value:"ready"});',
		value: 'record.value',
		expected: 'ready'
	},
	{
		name: 'an empty descriptor',
		declaration: 'const record = Object.defineProperty({value:"ready"},"other",{});',
		value: 'record.value',
		expected: 'ready'
	},
	{
		name: 'the original Reflect result',
		declaration: 'const installed = Reflect.defineProperty({},"value",{value:"ready"});',
		value: 'String(installed)',
		expected: 'true'
	},
	{
		name: 'a stored browser callback',
		declaration: `const record = ${storedCallback};`,
		value: 'typeof record.value',
		expected: 'function'
	},
	{
		name: 'an invoked browser callback',
		declaration: `const record = ${storedCallback};`,
		value: 'record.value()',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a reached installed getter',
		declaration:
			'const record = Object.defineProperty({value:"before"},"value",{get:()=>document.title});',
		value: 'record.value',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a data descriptor on a fresh null-prototype target',
		declaration:
			'const record = Object.defineProperty(Object.create(null),"value",{value:"created"});',
		value: 'record.value',
		expected: 'created'
	},
	{
		name: 'a stored callback on a fresh null-prototype target',
		declaration: `const record = ${createdCallback};`,
		value: 'typeof record.value',
		expected: 'function'
	},
	{
		name: 'an invoked callback on a fresh null-prototype target',
		declaration: `const record = ${createdCallback};`,
		value: 'record.value()',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a reached installed getter on a fresh null-prototype target',
		declaration:
			'const record = Object.defineProperty(Object.create(null),"value",{get:()=>document.title});',
		value: 'record.value',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a portable descriptor-map getter',
		declaration: `const record=${definitionMap('get value(){return {value:"ready"}}')};`,
		value: 'record.value',
		expected: 'ready'
	},
	{
		name: 'a stored descriptor-map callback',
		declaration: `const record=${definitionMap('value:{value:()=>document.title}')};`,
		value: 'typeof record.value',
		expected: 'function'
	},
	{
		name: 'an eager descriptor-map getter',
		declaration: `const record=${definitionMap('get value(){return {value:document.title}}')};`,
		value: 'record.value',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a getter on the original descriptor field',
		declaration: `const record=${definitionMap('value:{get value(){return document.title}}')};`,
		value: 'record.value',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'a computed map getter returning a descriptor with its own getter',
		declaration: `const key="value" as const;const record=${definitionMap('get [key](){return {get value(){return document.title}}}')};`,
		value: 'record.value',
		browser: true,
		expected: 'browser value'
	},
	{
		name: 'an authored Object replacement',
		declaration: `const Object = {defineProperty(_target: object, _key: string, descriptor: {value: string}) {
			return {value: descriptor.value + ' replacement'};
		}};
		const record = Object.defineProperty({},'value',{value:'authored'});`,
		value: 'record.value',
		expected: 'authored replacement'
	}
])('preserves module descriptor placement for $name', async (test) => {
	const root = await createCompilerTestWorkspace('.exact-module-descriptor-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`${test.declaration}\nexport function Page() { return () => <p>{${test.value}}</p>; }`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});

	const priorTitle = document.title;
	document.title = 'browser value';
	onTestFinished(() => {
		document.title = priorTitle;
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const { html } = await renderToString(receipt(server.Page as never, {}), { markers: false });
	if (test.browser) expect(html).toContain('data-exact-client-boundary=');
	else expect(html).toBe(`<p>${test.expected}</p>`);

	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const host = document.createElement('div');
	onTestFinished(() => unmount(host));
	const errors: unknown[] = [];
	render(receipt(client.Page as never, {}), host, {
		onErrorReport: (report) => errors.push(report.error)
	});
	expect(errors).toEqual([]);
	expect(host.textContent).toBe(test.expected);
});

it('requires placement evidence for a descriptor installed on an unknown module receiver', async () => {
	const root = await createCompilerTestWorkspace('.exact-module-descriptor-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`declare function foreign(): object;
		const record = Object.defineProperty(foreign(), 'value', {value: 'ready'});
		export function Page() { return () => <p>{typeof record}</p>; }`
	);
	await expect(
		compileProjectArtifacts([entry], { rootDir: root, outDir: path.join(root, 'generated') })
	).rejects.toThrow('EXACT2101');
});

it('refuses explicit server execution of an eager browser descriptor-map getter', async () => {
	const root = await createCompilerTestWorkspace('.exact-task-descriptor-map-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{label:string}>) {
	this.state.label="initial";
	const run=(task:TaskContext=TaskContext.server().blocking())=>{
		void task;
		const record=${definitionMap('get value(){return {value:document.title}}')};
		this.state.label=record.value;
	};
	run();
	return()=> <output>{this.state.label}</output>;
}`
	);
	await expect(
		compileProjectArtifacts([entry], { rootDir: root, outDir: path.join(root, 'generated') })
	).rejects.toThrow(/EXACT2001.*references browser-only globals/);
});
