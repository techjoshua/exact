import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { renderToString } from '@exactjs/ssr';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { compileProjectArtifacts } from '../index.js';
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
