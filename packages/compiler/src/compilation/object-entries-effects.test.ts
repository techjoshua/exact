import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { renderToString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';

const themeCopy = await readFile(
	new URL('../../../theme/src/observations.ts', import.meta.url),
	'utf8'
);

function readEntries(statement: string): string {
	return `
export function copyThemeData(input: object) {
	for (const [, child] of Object.entries(input)) {
		if (child && typeof child === 'object') ${statement}
	}
}
`;
}

const nestedGetter = 'const data={surface:{tone:{get metric(){document.title;return 1}}}};';
const immediateGetter = 'const data={surface:{get metric(){document.title;return 1}}};';
const inspectChild = readEntries('Object.entries(child);');

it.each([
	{ name: 'own data child', data: immediateGetter, copy: inspectChild, browser: true },
	{
		name: 'getter-produced child',
		data: 'const data={get surface(){return {get metric(){document.title;return 1}}}};',
		copy: inspectChild,
		browser: true
	},
	{
		name: 'unused yielded child',
		data: immediateGetter,
		copy: readEntries('void child;'),
		browser: false
	},
	{
		name: 'symbol-keyed getter',
		data: 'const key=Symbol();const data={get [key](){document.title;return {metric:2}},surface:{metric:2}};',
		copy: inspectChild,
		browser: false
	},
	{
		name: 'known child beside an unresolved value',
		data: 'const data={surface:{get metric(){document.title;return 1}},foreign:(globalThis as { exactEntriesValue?: object }).exactEntriesValue};',
		copy: inspectChild,
		local: true,
		browser: true
	},
	{ name: 'original Theme copy', data: nestedGetter, browser: true },
	{
		name: 'copy stops after the first iteration',
		data: nestedGetter,
		copy: themeCopy.replace('index < pending.length', 'index < 1'),
		browser: false
	},
	{
		name: 'copy never appends the child',
		data: immediateGetter,
		copy: themeCopy.replace("child && typeof child === 'object' ? copy(child) : child", 'child'),
		browser: false
	},
	{
		name: 'class with an own getter bypasses the copy',
		data: `class Shape {
			constructor(){Object.defineProperty(this,'metric',{enumerable:true,get:()=>document.title})}
		}
		const data={surface:new Shape()};`,
		local: true,
		browser: false
	},
	{
		name: 'cycle with a reached getter',
		data: 'const data:{self?:object;surface:object}={surface:{get metric(){document.title;return 1}}};data.self=data;',
		browser: true
	},
	{
		name: 'cycle without a reached getter',
		data: 'const data:{self?:object}={};data.self=data;',
		browser: false
	}
])(
	'retains placement for $name through an imported entries consumer',
	async (test) => {
		const root = await createCompilerTestWorkspace('.exact-entries-effects-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		await writeFile(path.join(root, 'observations.ts'), test.copy ?? themeCopy);
		await writeFile(
			entry,
			`
import { type Component } from '@exactjs/core';
import { copyThemeData } from './observations.js';
${test.local ? '' : test.data}
/** @exact pure */
function measure() {
	${test.local ? test.data : ''}
	copyThemeData(data);
	return 1;
}
export function Page(this: Component<{}>) {
	const value = this.reactive(() => measure());
	return () => <p>{value.get()}</p>;
}
`
		);
		const [artifact] = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		expect(artifact?.clientFile).toBeDefined();
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const { html } = await renderToString(receipt(server.Page as never, {}), { markers: false });
		if (test.browser) expect(html).toContain('data-exact-client-boundary=');
		else expect(html).toBe('<p>1</p>');
	},
	15000
);
