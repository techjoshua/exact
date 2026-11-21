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

const copiedStateInitializer =
	"Object.assign(Object.create(null) as {locale:string}, {locale:'initial'})";

it.each([
	{
		name: 'nested browser Get',
		body: 'const environment=make();',
		value: 'environment.state.locale',
		expected: 'browser title',
		browser: true
	},
	{
		name: 'nested browser Get on a copied record',
		initializer: copiedStateInitializer,
		value: 'make().state.locale',
		expected: 'browser title',
		browser: true
	},
	{
		name: 'literal receiver read through a helper parameter',
		value: 'readLocale(make().state)',
		expected: 'browser title',
		browser: true
	},
	{
		name: 'copied receiver read through a helper parameter',
		initializer: copiedStateInitializer,
		value: 'readLocale(make().state)',
		expected: 'browser title',
		browser: true
	},
	{
		name: 'different helper parameter',
		initializer: copiedStateInitializer,
		value: "readSecondLocale(make().state, {locale:'separate'})",
		expected: 'separate',
		browser: false
	},
	{
		name: 'dormant getter on a copied record',
		initializer: copiedStateInitializer,
		value: 'make().sourceLocale',
		expected: 'en',
		browser: false
	},
	{
		name: 'different copied record from the same factory',
		initializer: copiedStateInitializer,
		guard: 'if (active) ',
		body: 'const other=make(true); const environment=make(false);',
		value: 'environment.state.locale',
		expected: 'initial',
		browser: false
	},
	{
		name: 'direct receiver Get',
		factoryResult: 'state.locale',
		value: 'make()',
		expected: 'browser title',
		browser: true
	},
	{
		name: 'nested neutral Get',
		getter: "'installed'",
		value: 'make().state.locale',
		expected: 'installed',
		browser: false
	},
	{ name: 'dormant getter', value: 'make().sourceLocale', expected: 'en', browser: false },
	{
		name: 'different receiver',
		factoryResult: "{state:{locale:'separate'},other:state}",
		value: 'make().state.locale',
		expected: 'separate',
		browser: false
	},
	{
		name: 'other invocation of the same factory',
		guard: 'if (active) ',
		body: 'const other=make(true); const environment=make(false);',
		value: 'environment.state.locale',
		expected: 'initial',
		browser: false
	},
	{
		name: 'lexically shadowed installer',
		setup:
			'const Object={defineProperty(_target:object,_name:string,_descriptor:PropertyDescriptor){}};',
		value: 'make().state.locale',
		expected: 'initial',
		browser: false
	}
])(
	'retains factory descriptor ownership for $name in both artifacts',
	async ({
		name,
		setup,
		guard,
		initializer,
		getter,
		factoryResult,
		body,
		value,
		expected,
		browser
	}) => {
		const root = await createCompilerTestWorkspace('.exact-nested-descriptor-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		await writeFile(
			entry,
			`
function make(${guard ? 'active:boolean' : ''}) {
	${setup ?? ''}
	const state = ${initializer ?? "{locale:'initial'}"};
	${guard ?? ''}Object.defineProperty(state, 'locale', {get: () => ${getter ?? 'document.title'}});
	return ${factoryResult ?? "{sourceLocale:'en',state}"};
}
function readLocale(state: {locale:string}) { return state.locale; }
function readSecondLocale(_unread: {locale:string}, state: {locale:string}) {
	return readLocale(state);
}
export function Page() { ${body ?? ''} return () => <p>{${value}}</p>; }
`
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
		if (browser) expect(html, name).toContain('data-exact-client-boundary=');
		else expect(html, name).toBe(`<p>${expected}</p>`);

		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const host = document.createElement('div');
		onTestFinished(() => unmount(host));
		const reports: unknown[] = [];
		render(receipt(client.Page as never, {}), host, {
			onErrorReport: (report) => reports.push(report.error)
		});
		expect(reports).toEqual([]);
		expect(host.textContent).toBe(expected);
	}
);

it.each([
	{
		name: 'selected append',
		operations: 'pending.push(input);',
		browser: true
	},
	{
		name: 'stored input survives reassignment',
		operations: 'let value:object = input; pending.push(value); value = {};',
		browser: true
	},
	{
		name: 'reassignment after storing a different input',
		operations: 'let value:object = {}; pending.push(value); value = input;',
		browser: false
	},
	{
		name: 'authored push replacement',
		operations: 'pending.push = () => 1; pending.push(input);',
		browser: false
	}
])('keeps reached entry effects after $name', async ({ operations, browser }) => {
	const root = await createCompilerTestWorkspace('.exact-append-entry-effects-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		path.join(root, 'collect.ts'),
		`
export function collect(input: object) {
	const pending: object[] = [];
	${operations}
	const source = pending[0];
	if (source) Object.entries(source);
}
`
	);
	await writeFile(
		entry,
		`
import { type Component } from '@exactjs/core';
import { collect } from './collect.js';
/** @exact pure */
function measure() {
	collect({ get value() { return document.title; } });
	return 1;
}
export function Page(this: Component<{}>) {
	const measured = this.reactive(() => measure());
	return () => <p>{measured.get()}</p>;
}
`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const { html } = await renderToString(receipt(server.Page as never, {}), { markers: false });
	if (browser) expect(html).toContain('data-exact-client-boundary=');
	else expect(html).toBe('<p>1</p>');
});

it.each([
	{ member: '[patch()]() {}', browser: true },
	{ member: 'get [patch()]() { return 1; }', browser: true },
	{ member: 'set [patch()](value: number) { void value; }', browser: true },
	{ member: 'deferred() { const object = { [patch()]() {} }; }', browser: false }
])('places the downstream Get for $member', async ({ member, browser }) => {
	const root = await createCompilerTestWorkspace('.exact-computed-writer-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`
function holder() {}
holder.value = () => 0;
function patch(): string {
	Object.defineProperty(holder, 'value', { get() { return document.title; } });
	return 'key';
}
export function Page() {
	const object = { ${member} };
	const value = typeof holder.value;
	return () => <p>{value}</p>;
}
`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const { html } = await renderToString(receipt(server.Page as never, {}), { markers: false });
	if (browser) expect(html).toContain('data-exact-client-boundary=');
	else expect(html).toBe('<p>function</p>');

	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const host = document.createElement('div');
	onTestFinished(() => unmount(host));
	render(receipt(client.Page as never, {}), host);
	expect(host.textContent).toBe(browser ? 'string' : 'function');
});

it.each([
	{
		name: 'reached factory getter',
		helper: "Object.defineProperty({value:'safe'}, 'value', {get:makeGetter()})",
		expression: 'make().value',
		browser: true,
		expected: 'browser title'
	},
	{
		name: 'reached inline getter',
		helper: "Object.defineProperty({value:'safe'}, 'value', {get:()=>document.title})",
		expression: 'make().value',
		browser: true,
		expected: 'browser title'
	},
	{
		name: 'unread installed getter',
		helper: "Object.defineProperty({value:'safe'}, 'value', {get:makeGetter()})",
		expression: 'typeof make()',
		browser: false,
		expected: 'object'
	},
	{
		name: 'separate property',
		helper: "Object.defineProperty({value:'safe',other:''}, 'other', {get:makeGetter()})",
		expression: 'make().value',
		browser: false,
		expected: 'safe'
	},
	{
		name: 'authored lexical replacement',
		setup: 'const Object={defineProperty<T>(target:T,_key:string,_descriptor:PropertyDescriptor){return target}};',
		helper: "Object.defineProperty({value:'safe'}, 'value', {get:makeGetter()})",
		expression: 'make().value',
		browser: false,
		expected: 'safe'
	}
])('retains $name when a helper returns the descriptor target', async (test) => {
	const root = await createCompilerTestWorkspace('.exact-returned-descriptor-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`
${test.setup ?? ''}
function makeGetter(){return()=>document.title}
function make(){return ${test.helper}}
export function Page(){
	const value=${test.expression};
	return () => <p>{value}</p>;
}
`
	);
	const [artifacts] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifacts!.serverFile, path.join(root, 'server.mjs'));
	const priorTitle = document.title;
	document.title = 'browser title';
	onTestFinished(() => {
		document.title = priorTitle;
	});
	const { html } = await renderToString(receipt(server.Page as never, {}), { markers: false });
	if (test.browser) expect(html).toContain('data-exact-client-boundary=');
	else expect(html).toBe(`<p>${test.expected}</p>`);

	const client = await importArtifact(artifacts!.clientFile, path.join(root, 'client.mjs'));
	const host = document.createElement('div');
	const reports: unknown[] = [];
	onTestFinished(() => unmount(host));
	render(receipt(client.Page as never, {}), host, {
		onErrorReport: (report) => reports.push(report.error)
	});
	expect(host.textContent).toBe(test.expected);
	expect(reports).toEqual([]);
});

it.each([
	{
		name: 'an ordinary object',
		definition: "const value = { get metric() { return document.title; } };"
	},
	{
		name: 'a class instance',
		definition: "class Holder { get metric() { return document.title; } } const value = new Holder();"
	}
])('keeps unrelated getters dormant when invoking $name', async ({ definition }) => {
	const root = await createCompilerTestWorkspace('.exact-noncallable-getter-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`
function attempt() {
	${definition}
	try {
		(value as unknown as () => void)();
		return 'unexpected';
	} catch (failure) {
		if (!(failure instanceof TypeError)) throw failure;
		return 'not callable';
	}
}
export function Page() {
	const result = attempt();
	return () => <p>{result}</p>;
}
`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const { html } = await renderToString(receipt(server.Page as never, {}), { markers: false });
	expect(html).toBe('<p>not callable</p>');
});
