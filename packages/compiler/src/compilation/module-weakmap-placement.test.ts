/** @vitest-environment jsdom */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { renderToString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

const nativeAllocation = 'const map = new WeakMap<object, string>(); const key = {};';
const cases = [
	{ name: 'portable write', source: "map.set(key, 'ready');", output: 'ready:miss' },
	{
		name: 'browser value',
		source: 'map.set(key, document.title);',
		output: 'browser value:miss',
		browser: true
	},
	{
		name: 'browser key',
		source: "map.set(document.title ? key : key, 'ready');",
		output: 'ready:miss',
		browser: true
	},
	{
		name: 'authored set replacement',
		source:
			"map.set = function (_key: object, _value: string) {return this}; map.set(key, 'ready');",
		output: 'missing:miss'
	},
	{
		name: 'browser set replacement',
		source:
			"map.set = function (_key: object, _value: string) {document.title; return this}; map.set(key, 'ready');",
		output: 'missing:miss',
		browser: true
	},
	{
		name: 'lexical WeakMap shadow',
		allocation: `const WeakMap = class {
			set(_key: object, _value: string) {return this}
			get(_key: object) {return 'authored'}
		}; const map = new WeakMap(); const key = {};`,
		source: "map.set(key, 'ready');",
		output: 'authored:authored'
	}
];

it.each(cases)('renders a $name from paired artifacts', async (fixture) => {
	const root = await createCompilerTestWorkspace('.exact-module-weakmap-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`${fixture.allocation ?? nativeAllocation}
${fixture.source}
export function Page() { return () => <p>{map.get(key) ?? 'missing'}:{map.get({}) ?? 'miss'}</p>; }`
	);
	for (const packageType of ['application', 'library'] as const) {
		const outDir = path.join(root, packageType);
		const [artifact] = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir,
			packageType
		});

		vi.stubGlobal('document', undefined);
		try {
			const server = await importArtifact(artifact!.serverFile, path.join(outDir, 'server.mjs'));
			const { html } = await renderToString(receipt(server.Page as never, {}), { markers: false });
			if (fixture.browser) expect(html).toContain('data-exact-client-boundary=');
			else expect(html).toBe(`<p>${fixture.output}</p>`);
		} finally {
			vi.unstubAllGlobals();
		}

		const host = document.createElement('div');
		const title = vi.spyOn(document, 'title', 'get').mockReturnValue('browser value');
		try {
			const client = await importArtifact(artifact!.clientFile, path.join(outDir, 'client.mjs'));
			const errors: unknown[] = [];
			render(receipt(client.Page as never, {}), host, {
				onErrorReport: (report) => errors.push(report.error)
			});
			expect(errors).toEqual([]);
			expect(host.textContent).toBe(fixture.output);
			expect(title).toHaveBeenCalledTimes(fixture.browser ? 1 : 0);
		} finally {
			title.mockRestore();
			unmount(host);
		}
	}
});
