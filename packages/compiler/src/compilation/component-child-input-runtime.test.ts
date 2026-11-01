/** @vitest-environment jsdom */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { testComponent } from '@exactjs/testing';
import { render, unmount } from '@exactjs/dom';
import {
	createErrorContext,
	ErrorContext,
	type AnyComponentFunction,
	type Child
} from '@exactjs/core';
import { compileProjectArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompilerTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

it('keeps a late owned callback a reactive component-only public root', async () => {
	const root = await createCompilerTestWorkspace('.exact-child-input-', process.cwd());
	const source = await readFile(
		path.resolve(
			import.meta.dirname,
			'../../../../packages/component-composition-corpus/test-support/component-child-input.fixtures.tsx'
		),
		'utf8'
	);
	const files = await writeTestFiles(root, { 'page.tsx': source });
	const artifacts = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const artifact = artifacts.find((value) => value.inputFile === files['page.tsx'])!;
	const client = await importArtifact(artifact.clientFile, path.join(root, 'client.mjs'));
	const errors = createErrorContext(),
		reports: unknown[] = [];
	const view = await testComponent(client.LateInputOwner as AnyComponentFunction)
		.context(ErrorContext, errors)
		.mount();
	const host = document.createElement('div');
	document.body.append(host);
	const instance = view.root.instance;
	let button: Element | null = null;
	try {
		const shell = view.component(client.LateInputShell as AnyComponentFunction);
		const callback = (shell.props() as { build(label: string): Child }).build;
		expect(shell.instance.scope.active).toBe(true);
		render(callback('late'), host, { onErrorReport: (report) => reports.push(report.error) });
		button = host.querySelector('button');
		expect(host.querySelector('span')?.textContent).toBe('visible');
		expect(button?.textContent).toBe('late');
		await view.root.setState({ show: false });
		expect(host.querySelector('span')).toBeNull();
		expect(host.querySelector('button')).toBe(button);
		await view.root.setState({ show: true });
		expect(host.querySelector('span')?.textContent).toBe('visible');
		expect(host.querySelector('button')).toBe(button);
		expect(view.root.instance).toBe(instance);
		expect(shell.instance.scope.active).toBe(true);
		expect(errors.errors).toEqual([]);
		expect(reports).toEqual([]);
	} finally {
		unmount(host);
		view.unmount();
		host.remove();
	}
	expect(instance.scope.active).toBe(false);
	expect(button?.isConnected).toBe(false);
	expect(host.childNodes).toHaveLength(0);
});
