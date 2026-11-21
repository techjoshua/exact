import path from 'node:path';
import { expect, it, onTestFinished, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { renderToString } from '@exactjs/ssr';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { compileProjectArtifacts } from '../index.js';
import { ExactCompilerSession } from '../expression/project.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { analyzeSource } from './source-analysis.js';
it.each([
	`function make(){return {get value(){return window.location.href;}};}export function Page(){const holder=make();return()=> <p>portable</p>;}`,
	`function make(){return {set value(value:string){window.document.title=value;}};}export function Page(){const holder=make();return()=> <p>portable</p>;}`
])('does not execute accessors while constructing their owner: %s', (source) => {
	const analysis = analyzeSource(source, {
		filename: path.resolve('unread-accessor.fixture.tsx'),
		target: 'server'
	});
	expect(analysis.components[0]?.placement).toBe('isomorphic');
});
it.each([
	`const holder={get value(){return window.location.href;}};const value=holder.value;`,
	`const holder={set value(value:string){window.document.title=value;}};holder.value='title';`,
	`const holder={get [window.location.href](){return 'value';}};`
])('retains effects when accessors or computed names execute: %s', (body) => {
	const analysis = analyzeSource(`export function Page(){${body}return()=> <p>ready</p>;}`, {
		filename: path.resolve('accessed-accessor.fixture.tsx'),
		target: 'server'
	});
	expect(analysis.components[0]?.placement).toBe('client');
});
it.each(['getter', 'setter'])(
	'preserves a deferred %s through emitted server rendering',
	async (kind) => {
		const root = await createCompilerTestWorkspace('.exact-accessor-owner-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		const accessor =
			kind === 'getter'
				? `get value(){return window.location.href;}`
				: `set value(value:string){window.document.title=value;}`;
		await writeFile(
			entry,
			`export function make(){return {${accessor}};}export function Page(props:{format:(value:string)=>string}){const holder=make();return()=> <p>{props.format('ready')}</p>;}`
		);
		const [artifact] = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const output = await renderToString(
			receipt(server.Page as never, { format: (value: string) => 'accessor:' + value })
		);
		expect(output.html).toContain('accessor:ready');
		const holder = (
			server.make as () => {
				value: string;
			}
		)();
		vi.stubGlobal('window', {
			location: { href: 'https://example.test/accessor' },
			document: { title: '' }
		});
		try {
			if (kind === 'getter') expect(holder.value).toBe('https://example.test/accessor');
			else {
				holder.value = 'updated';
				expect(window.document.title).toBe('updated');
			}
		} finally {
			vi.unstubAllGlobals();
		}
	}
);
it.each([
	{
		name: 'captured entry alias',
		definitions: `function make(input:{value:string}){const old=input;return {get value(){return old.value},replace(next:{value:string}){input=next}}}`,
		body: `const box=make({value:'safe'});box.replace({get value(){return window.location.href}});const value=box.value;`,
		expected: 'safe'
	},
	{
		name: 'overridden getter',
		definitions: `class Base{get value(){return window.location.href;}}class Holder extends Base{get value(){return 'safe';}}`,
		body: `const holder:{value:string}=new Holder();const value=holder.value;`,
		expected: 'safe'
	},
	{
		name: 'prototype enumeration',
		definitions: `class Holder{get value(){return window.location.href;}}`,
		body: `const holder:{value:string}=new Holder();const value=String(Object.values(holder).length);`,
		expected: '0'
	},
	{
		name: 'prototype serialization',
		definitions: `class Holder{get nested(){return {get value(){return window.location.href;}};}}`,
		body: `const value=JSON.stringify(new Holder());`,
		expected: '{}'
	}
])('preserves server rendering for $name', async ({ definitions, body, expected }) => {
	const root = await createCompilerTestWorkspace('.exact-accessor-prototype-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`${definitions}export function Page(props:{format:(value:string)=>string}){${body}return()=> <p>{props.format(value)}</p>;}`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const output = await renderToString(
		receipt(server.Page as never, { format: (value: string) => 'prototype:' + value })
	);
	expect(output.html).toContain('prototype:' + expected);
});

it.each([
	{ expression: 'document.title', owner: 'existing receiver', browser: true },
	{ expression: "'safe'", owner: 'existing receiver', browser: false },
	{ expression: 'document.title', owner: 'inline factory result', browser: true },
	{ expression: "'safe'", owner: 'inline factory result', browser: false }
] as const)(
	'retains callable placement through Reflect.get and descriptor data on an $owner ($expression)',
	async ({ expression, owner, browser }) => {
		const root = await createCompilerTestWorkspace('.exact-reflect-get-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		const definitions =
			owner === 'existing receiver'
				? `
function install(cell: {field: Callback}, input: {payload: Callback}, key: string) {
	Object.defineProperty(cell, 'field', {value: Reflect.get(input, key)});
}
function paint() {
	const cell = {field: () => 'initial'};
	install(cell, {payload: () => ${expression}}, 'payload');
	return cell.field();
}
`
				: `
function make(input: {payload: Callback}, key: string) {
	const cell = {field: () => 'initial'};
	Object.defineProperty(cell, 'field', {value: Reflect.get(input, key)});
	return cell;
}
function paint() { return make({payload: () => ${expression}}, 'payload').field(); }
`;
		await writeFile(
			entry,
			`type Callback = () => string;
${definitions}
export function Page() { return () => <p>{paint()}</p>; }`
		);
		const [artifact] = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const { html } = await renderToString(receipt(server.Page as never, {}), { markers: false });
		if (browser) expect(html).toContain('data-exact-client-boundary=');
		else expect(html).toBe('<p>safe</p>');
	}
);

it.each(['portable', 'browser'] as const)(
	'retains the %s setter installed by a construction dependency',
	async (kind) => {
		const root = await createCompilerTestWorkspace('.exact-construction-setter-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		await writeFile(
			path.join(root, 'error.ts'),
			`export const events: string[] = [];
export class DisplayError extends Error {
	readonly code: string;
	readonly path: string;
	constructor(code: string, path: string, message: string) {
		super(message);
		this.name = 'DisplayError';
		this.code = code;
		this.path = path;
	}
}`
		);
		await writeFile(
			path.join(root, 'install.ts'),
			`import { DisplayError, events } from './error.js';
events.push('installed');
Object.defineProperty(DisplayError.prototype, 'name', {
	configurable: true,
	set(value: string) {
		events.push('set:' + value);
		${kind === 'browser' ? 'document.title = value;' : ''}
	}
});`
		);
		await writeFile(path.join(root, 'initialize.ts'), `import './install.js';`);
		await writeFile(
			entry,
			`import './initialize.js';
import { DisplayError, events } from './error.js';
export function observations() { return events; }
function fail(): never { throw new DisplayError('invalid', 'appearance', 'Invalid appearance'); }
function showError() {
	try {
		fail();
	} catch (error) {
		if (error instanceof DisplayError) return error.code + ':' + error.path + ':' + error.message;
		throw error;
	}
}
export function Page() { return () => <p>{showError()}</p>; }`
		);
		const [artifact] = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const observations = server.observations as () => string[];
		expect(observations()).toEqual(['installed']);
		const { html } = await renderToString(receipt(server.Page as never, {}), { markers: false });
		if (kind === 'browser') {
			expect(html).toContain('data-exact-client-boundary=');
			expect(observations()).toEqual(['installed']);
		} else {
			expect(html).toBe('<p>invalid:appearance:Invalid appearance</p>');
			expect(observations()).toEqual(['installed', 'set:DisplayError']);
		}
	}
);


it('reads the module symbol selected by a component task after a retained edit', async () => {
	const root = await createCompilerTestWorkspace('.exact-symbol-descriptor-', process.cwd());
	const filename = path.join(root, 'page.tsx');
	const session = new ExactCompilerSession();
	onTestFinished(() => session.dispose());
	for (const [name, declarations, use, expected] of [
		['literal', "const key=Symbol.for('selected');", 'key', 17],
		['alias', "const key=Symbol.for('selected');const alias=key;", 'alias', 17],
		['variable', "const spelling='selected';const key=Symbol.for(spelling);", 'key', 17],
		['edited', "const key=Symbol.for('other');", 'key', 31],
		['absent', "const key=Symbol.for('absent');", 'key', -1]
	] as const) {
		const source = `import {TaskContext,type Component} from '@exactjs/core';
${declarations}
function read(value:object){return Object.getOwnPropertyDescriptor(value,${use})?.value}
export function Page(this:Component<{result:number}>){
	this.state.result=0;
	const run=(task:TaskContext=TaskContext.server().blocking())=>{
		void task;
		const fields={[Symbol.for('selected')]:17,[Symbol.for('other')]:31};
		const value=read(fields);
		this.state.result=typeof value==='number'?value:-1;
	};
	run();
	return()=> <output>{this.state.result}</output>;
}`;
		await writeFile(filename, source);
		for (const target of ['client', 'server'] as const) {
			const compiled = session.compileNative({
				kind: 'compile',
				id: filename,
				source,
				root,
				configFile: path.join(root, 'tsconfig.json'),
				target,
				diagnostics: 'semantic'
			});
			expect(compiled.error).toBeUndefined();
			expect(compiled.diagnostics).toEqual([]);
			expect(compiled.analysis?.tasks).toMatchObject([
				{ placement: 'server', browserEffects: false }
			]);
			expect(compiled.code).toBeTruthy();
			if (target === 'server') {
				const executable = path.join(root, name + '.tsx');
				await writeFile(executable, compiled.code!);
				const server = await importArtifact(executable, path.join(root, name + '.mjs'));
				const output = await renderToString(receipt(server.Page as never, {}), { markers: false });
				expect(output.html).toBe(`<output>${expected}</output>`);
			}
		}
	}
});
