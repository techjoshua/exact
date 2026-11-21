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

const prototype = '{get title(){return document.title}}';
const call = `make(${prototype})`;
const create = 'function make(proto: object){return Object.create(proto)}';
const freeze = 'function make(proto: object){return Object.freeze(Object.create(proto))}';

it.each([
	{
		name: 'direct creation',
		declaration: '',
		value: `Object.create(${prototype}).title`,
		browser: true,
		expected: 'browser title'
	},
	{ name: 'returned creation', declaration: create, value: `${call}.title`, browser: true, expected: 'browser title' },
	{ name: 'returned frozen creation', declaration: freeze, value: `${call}.title`, browser: true, expected: 'browser title' },
	{
		name: 'held frozen creation',
		declaration: freeze,
		value: `${call} === null ? 'missing' : 'ready'`,
		browser: false,
		expected: 'ready'
	},
	{
		name: 'own descriptor supplied during creation',
		declaration: `function make(proto: object){return Object.create(proto,{title:{value:'own'}})}`,
		value: `${call}.title`,
		browser: false,
		expected: 'own'
	},
	{
		name: 'own descriptor installed before return',
		declaration: `function make(proto: object){const created=Object.create(proto);Object.defineProperty(created,'title',{value:'own'});return created}`,
		value: `${call}.title`,
		browser: false,
		expected: 'own'
	},
	{
		name: 'prototype changed before creation',
		declaration: `function make(proto: object){Object.defineProperty(proto,'title',{value:'changed'});return Object.create(proto)}`,
		value: `${call}.title`,
		browser: false,
		expected: 'changed'
	},
	{
		name: 'authored Create replacement',
		declaration: `function make(proto: object){const Object={create(_prototype:object){return {title:'replacement'}}};return Object.create(proto)}`,
		value: `${call}.title`,
		browser: false,
		expected: 'replacement'
	}
])('selects the executed getter for $name in both artifacts', async (test) => {
	const root = await createCompilerTestWorkspace('.exact-created-prototype-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(entry, `${test.declaration}\nexport function Page() { const title = ${test.value}; return () => <p>{title}</p>; }`);
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
	else expect(html).toBe(`<p>${test.expected}</p>`);

	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const host = document.createElement('div');
	onTestFinished(() => unmount(host));
	const reports: unknown[] = [];
	render(receipt(client.Page as never, {}), host, {
		onErrorReport: (report) => reports.push(report.error)
	});
	expect(reports).toEqual([]);
	expect(host.textContent).toBe(test.expected);
});
