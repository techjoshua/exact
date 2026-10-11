/** @vitest-environment jsdom */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { renderToHydratableString } from '@exactjs/ssr';
import { composeExactExecutorContract, handleExactRequest } from '@exactjs/server';
import { mountClientServerTest, type ClientServerTestView } from '@exactjs/testing';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each([
	{ placement: 'client', mode: 'mount' },
	{ placement: 'client', mode: 'hydrate' },
	{ placement: 'server', mode: 'hydrate' }
])(
	'preserves captured types and selector execution across retained updates ($placement/$mode)',
	async ({ placement, mode }) => {
		const root = await createTestWorkspace('.exact-task-captured-inputs-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		const source = await readFile(
			path.resolve(
				'packages/component-composition-corpus/src/test-support/task-captured-inputs.fixtures.tsx'
			),
			'utf8'
		);
		await writeFile(entry, source.replace('TaskContext.server()', `TaskContext.${placement}()`));
		const outDir = path.join(root, 'generated');
		const artifacts = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir,
			serverComponents: true,
			instrumentInspection: true
		});
		const compiled = artifacts.find((artifact) => artifact.inputFile === entry)!;
		const client = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
		const server = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
		const Client = client.CapturedTaskShell as AnyComponentFunction;
		const Server = server.CapturedTaskShell as AnyComponentFunction;
		const host = document.createElement('div');
		const reports: unknown[] = [];
		let requests = 0;
		let view: ClientServerTestView | undefined;
		onTestFinished(() => {
			view?.unmount();
			unmount(host);
		});
		if (mode === 'hydrate') {
			const graph = createExactArtifactGraph(artifacts, {
				packageRoot: root,
				sourceRoot: root,
				rootDir: outDir
			});
			const registry = path.join(outDir, 'registration.ts');
			await writeFile(registry, createExactHydrationRegistrationModule(graph));
			const module = await importArtifact(registry, path.join(root, 'registration.mjs'));
			const registration = module.exactHydrationRegistration as {
				islands: Parameters<typeof mountClientServerTest>[0]['islands'];
			};
			const output = await renderToHydratableString(receipt(Server, {}));
			const contract = composeExactExecutorContract([
				Server,
				server.CapturedTaskInputs as AnyComponentFunction
			]);
			view = await mountClientServerTest({
				container: host,
				server: output,
				islands: registration.islands,
				hydrate: {
					...registration,
					endpoint: '/__exact',
					onMismatch: 'throw',
					onErrorReport: (report) => reports.push(report.error),
					onDiagnostic: (report) => reports.push(report)
				},
				handle: (request) => {
					requests++;

					return handleExactRequest(request, {
						contract,
						logger: {
							log(event) {
								if (event.level === 'error') reports.push(event);
							}
						}
					});
				}
			});
			expect(view.hydration.map((entry) => entry.outcome)).toContain('adopted');
			expect(view.hydration.some((entry) => entry.outcome === 'mounted')).toBe(false);
		} else
			render(receipt(Client, {}), host, { onErrorReport: (report) => reports.push(report.error) });
		const output = host.querySelector('output');

		await expect.poll(() => output?.textContent).toBe('7:7:18:1:1,2');
		const run = host.querySelector<HTMLButtonElement>('[data-run]')!;
		for (const expected of ['11:11:18:1:1,2', '7:7:18:1:1,2']) {
			host.querySelector<HTMLButtonElement>('[data-switch]')!.click();
			await view?.settle();
			const before = requests;
			run.click();
			await view?.settle();
			if (placement === 'server') expect(requests).toBeGreaterThan(before);
			await expect.poll(() => output?.textContent).toBe(expected);
			expect(host.querySelector('output')).toBe(output);
		}
		host.querySelector<HTMLButtonElement>('[data-remove]')!.click();
		await view?.settle();
		await expect.poll(() => host.querySelector('output')).toBeNull();
		const before = requests;
		run.click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(requests).toBe(before);
		expect(reports).toEqual([]);
	}
);
