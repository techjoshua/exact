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

const browserValue = '{ get value() { return document.title; } }';
const assign = `box.other = ${browserValue};`;
const scenarios = [
	{ name: 'direct Set', before: assign, browser: true },
	{ name: 'literal index Get', before: assign, browser: true, read: "selected['value']" },
	{
		name: 'helper declared after field acquisition',
		before: 'install();',
		after: `function install() { ${assign} }`,
		browser: true
	},
	{ name: 'Set after saving the field', after: assign },
	{ name: 'disjoint setter body', before: assign, field: 'disjoint' },
	{
		name: 'direct helper Call',
		before: `function install() { ${assign} } install();`,
		browser: true
	},
	{
		name: 'forwarded setter input',
		before: `function install(value: { value: string }) { box.other = value; } install(${browserValue});`,
		browser: true
	},
	{ name: 'dormant helper', before: `function install() { ${assign} }` },
	{ name: 'later overwrite', before: `${assign} box.field = { value: 'safe' };` },
	{ name: 'earlier overwrite', before: `box.field = { value: 'safe' }; ${assign}`, browser: true },
	{
		name: 'dormant getter',
		before:
			"box.other = { value: 'safe', get dormant() { return document.title; } } as { value: string };"
	}
];

it.each(scenarios)('renders storage written through $name', async (scenario) => {
	const root = await createCompilerTestWorkspace('.exact-setter-storage-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`
		function read() {
			const box = {
				field: { value: 'safe' },
				disjoint: { value: 'unused' },
				set other(value: { value: string }) { this.${scenario.field ?? 'field'} = value; }
			};
			${scenario.before ?? ''}
			const selected = box.field;
			${scenario.after ?? ''}
			return ${scenario.read ?? 'selected.value'};
		}
		export function Page() { return () => <p>{read()}</p>; }
	`
	);

	for (const packageType of ['application', 'library'] as const) {
		const [artifact] = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, packageType),
			packageType
		});
		const server = await importArtifact(
			artifact!.serverFile,
			path.join(root, `${packageType}-server.mjs`)
		);
		const client = await importArtifact(
			artifact!.clientFile,
			path.join(root, `${packageType}-client.mjs`)
		);
		const browserDocument = document;
		vi.stubGlobal('document', undefined);
		try {
			const { html } = await renderToString(receipt(server.Page as never, {}), { markers: false });
			if (scenario.browser) expect(html).toContain('data-exact-client-boundary=');
			else expect(html).toBe('<p>safe</p>');
		} finally {
			vi.unstubAllGlobals();
		}

		const host = browserDocument.createElement('div');
		const reports: unknown[] = [];
		const title = browserDocument.title;
		onTestFinished(() => unmount(host));
		try {
			browserDocument.title = 'browser value';
			render(receipt(client.Page as never, {}), host, {
				onErrorReport: (report) => reports.push(report.error)
			});
			expect(host.textContent).toBe(scenario.browser ? 'browser value' : 'safe');
			expect(reports).toEqual([]);
		} finally {
			browserDocument.title = title;
		}
	}
});
