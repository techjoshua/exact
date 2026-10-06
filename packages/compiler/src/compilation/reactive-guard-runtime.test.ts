import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each([
	'if(typeof window!=="undefined")window.alert("x");',
	'if(typeof window!="undefined")window["alert"]("x");',
	'typeof window==="undefined" ? undefined : window.alert("x");',
	'(typeof (window))!==("undefined") && window.alert("x");',
	'typeof window==="undefined" || window.alert("x");'
])('keeps guarded browser calls callable in both artifacts: %s', async (guard) => {
	const root = await createTestWorkspace('.exact-reactive-guard-', process.cwd());
	const entry = path.join(root, 'helper.ts');
	await writeFile(entry, `export function run(){${guard}return 'portable';}`);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	for (const [target, file] of [
		['client', artifact.clientFile],
		['server', artifact.serverFile]
	] as const) {
		const output = await importArtifact(file, path.join(root, target + '.mjs'));
		expect((output.run as () => string)()).toBe('portable');
		expect((output.run as () => string)()).toBe('portable');
	}
});
