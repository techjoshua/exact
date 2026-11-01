/** @vitest-environment jsdom */
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { renderToString } from '@exactjs/ssr';
import { render, dispose } from '@exactjs/dom';
import { compileFileArtifacts } from '../index.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
it('renders standard primitive methods through indexed union aliases in both targets', async () => {
	await mkdir(path.resolve('.tmp'), { recursive: true });
	const workspace = await createCompilerTestWorkspace('primitive-alias-', path.resolve('.tmp'));
	const input = path.join(workspace, 'page.tsx');
	await writeFile(
		input,
		`type Values={readonly text:'temporal-date'|'temporal-time';readonly count:1|2};function classify(value:Values['text']){return value.startsWith('temporal-');}function format(value:Values['count']){return value.toFixed(1);}export function Page(props:Values){const text=classify(props.text);const count=format(props.count);return()=> <output>{String(text)}:{count}</output>;}`
	);
	const artifact = await compileFileArtifacts(input, {
		rootDir: workspace,
		outDir: path.join(workspace, 'generated'),
		serverComponents: true
	});
	const server = await importArtifact(artifact.serverFile, path.join(workspace, 'server.mjs'));
	const props = { text: 'temporal-date', count: 2 };
	expect(
		(await renderToString(receipt(server.Page as AnyComponentFunction, props))).html
	).toContain('<output>true:2.0</output>');
	const client = await importArtifact(artifact.clientFile, path.join(workspace, 'client.mjs'));
	const host = document.createElement('div');
	onTestFinished(() => {
		dispose(host);
	});
	render(receipt(client.Page as AnyComponentFunction, props), host);
	expect(host.textContent).toBe('true:2.0');
});
