import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { renderToString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';

it.each([
	{ argument: 'writer', expected: 'initial' },
	{ argument: 'operand.value', expected: 'changed' }
])('renders the member selected after Array.isArray($argument)', async ({ argument, expected }) => {
	const root = await createCompilerTestWorkspace('.exact-array-writer-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`function select() {
	const member = {read: () => 'initial'};
	function writer() { member.read = () => 'changed'; }
	const operand = {get value() { writer(); return writer; }};
	Array.isArray(${argument});
	return member.read();
}
export function Page() { return () => <p>{select()}</p>; }`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const { html } = await renderToString(receipt(server.Page as never, {}), { markers: false });
	expect(html).toBe(`<p>${expected}</p>`);
});
