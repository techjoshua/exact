/** @vitest-environment jsdom */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished, vi } from 'vitest';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { renderToString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

const literal = "{locale:'initial'}";
const created = 'Object.create(null) as {locale:string}';
const authoredCopy = `
const replacement = {locale:'replacement'};
const Object = {assign(_target: {locale:string}, _source: {locale:string}) { return replacement; }};
`;
const unresolvedCopy = `
declare function exactTestCopy(target: {locale:string}, source: {locale:string}): {locale:string};
`;

it.each([
	{ name: 'literal target', target: literal, browser: true, expected: 'browser title' },
	{ name: 'created target', target: created, browser: true, expected: 'browser title' },
	{
		name: 'separate receiver',
		target: created,
		receiver: "{locale:'separate'}",
		browser: false,
		expected: 'separate'
	},
	{
		name: 'target ignored by an authored copy',
		target: literal,
		setup: authoredCopy,
		browser: false,
		expected: 'initial'
	},
	{
		name: 'receiver selected by an authored copy',
		target: literal,
		setup: authoredCopy,
		receiver: 'alias',
		browser: true,
		expected: 'browser title'
	},
	{
		name: 'known copy beside an unresolved alternative',
		target: literal,
		choose: true,
		browser: true,
		expected: 'browser title'
	},
	{
		name: 'unresolved copy beside a known alternative',
		target: literal,
		choose: false,
		browser: true,
		expected: 'initial'
	},
	{
		name: 'getter on the original copy source',
		target: created,
		input: '{get locale(){return document.title}}',
		getter: "'installed'",
		browser: true,
		expected: 'installed'
	}
])('retains factory descriptor effects for $name in both artifacts', async (test) => {
	const root = await createCompilerTestWorkspace('.exact-copy-alias-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	const conditional = test.choose !== undefined;
	const copy = 'Object.assign(target, input)';
	const alias = conditional ? `choose ? ${copy} : exactTestCopy(target, input)` : copy;
	const installer = test.setup ? 'Reflect.defineProperty' : 'Object.defineProperty';
	await writeFile(
		entry,
		`
${conditional ? unresolvedCopy : ''}
function make(input: {locale:string}${conditional ? ', choose: boolean' : ''}) {
	${test.setup ?? ''}
	const target = ${test.target};
	const alias = ${alias};
	${installer}(alias, 'locale', {get: () => ${test.getter ?? 'document.title'}});
	return {state: ${test.receiver ?? 'target'}};
}
export function Page(${conditional ? 'props: {choose: boolean}' : ''}) {
	return () => <p>{make(${test.input ?? "{locale:'copied'}"}${conditional ? ', props.choose' : ''}).state.locale}</p>;
}
`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const callback = vi.fn(() => ({ locale: 'from host' }));
	if (conditional) {
		vi.stubGlobal('exactTestCopy', callback);
		onTestFinished(() => vi.unstubAllGlobals());
	}
	const title = document.title;
	document.title = 'browser title';
	onTestFinished(() => {
		document.title = title;
	});
	const props = conditional ? { choose: test.choose } : {};
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const { html } = await renderToString(receipt(server.Page as never, props), { markers: false });
	if (test.browser) expect(html).toContain('data-exact-client-boundary=');
	else expect(html).toBe(`<p>${test.expected}</p>`);
	expect(callback).toHaveBeenCalledTimes(0);

	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	const host = document.createElement('div');
	onTestFinished(() => unmount(host));
	const reports: unknown[] = [];
	render(receipt(client.Page as never, props), host, {
		onErrorReport: (report) => reports.push(report.error)
	});
	expect(reports).toEqual([]);
	expect(host.textContent).toBe(test.expected);
	expect(callback).toHaveBeenCalledTimes(test.choose === false ? 1 : 0);
});
