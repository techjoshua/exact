/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { render } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(['quote"key', 'slash\\key'] as const)(
	'preserves registry ownership outside the source directory for %s',
	async (key) => {
		const root = await createTestWorkspace('.exact-registry-ownership-', process.cwd());
		const source = path.resolve(
			'packages/component-composition-corpus/src/scenarios/registry.fixtures.tsx'
		);
		const results = await compileProjectArtifacts([source], {
			rootDir: path.dirname(source),
			outDir: path.join(root, 'generated')
		});
		const entry = results.find((result) => result.inputFile === source)!;
		const client = await importArtifact(entry.clientFile, path.join(root, 'client.mjs'));
		const server = await importArtifact(entry.serverFile, path.join(root, 'server.mjs'));
		type Operation = Parameters<typeof render>[0];
		const clientRoot = client.escapedRegistryRoot as (key: string) => Operation;
		const serverRoot = server.escapedRegistryRoot as (key: string) => Operation;
		const output = await renderToHydratableString(serverRoot(key));
		const container = document.createElement('div');
		container.innerHTML = output.htmlWithHydration;
		const original = container.querySelector('p');
		expect(original?.textContent).toBe(key === 'quote"key' ? 'first' : 'lazy second');
		const reports: unknown[] = [];
		const view = hydrate(clientRoot(key), container, {
			onMismatch: 'throw',
			onErrorReport: (report) => reports.push(report.error)
		});
		onTestFinished(() => view.dispose());
		await view.whenSettled();
		expect(container.querySelector('p')).toBe(original);
		render(clientRoot(key), container);
		await view.whenSettled();
		expect(container.querySelector('p')).toBe(original);
		const next = key === 'quote"key' ? 'slash\\key' : 'quote"key';
		render(clientRoot(next), container);
		await expect
			.poll(() => container.querySelector('p')?.textContent)
			.toBe(next === 'quote"key' ? 'first' : 'lazy second');
		expect(container.querySelector('p')).not.toBe(original);
		expect(reports).toEqual([]);
	}
);
