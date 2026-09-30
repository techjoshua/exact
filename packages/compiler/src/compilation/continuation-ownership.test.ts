/** @vitest-environment jsdom */
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { composeExactExecutorContract, handleExactRequest } from '@exactjs/server';
import { renderToHydratableString } from '@exactjs/ssr';
import { mountClientServerTest, type ClientServerTestView } from '@exactjs/testing';
import type { ClientIslandRegistry } from '@exactjs/hydrate';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished, vi } from 'vitest';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { ownershipJourneySource } from '../test-support/ownership-journey-source.js';

function gate<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

it.each([false, true])(
	'isolates repeated paired owners, optimistic rollback and owned resources (batch=%s)',
	async (batch) => {
		const runs: Array<{
			owner: string;
			signal: AbortSignal;
			result: ReturnType<typeof gate<number>>;
			closed: number;
		}> = [];
		const mounted = new Map<string, number>();
		const unmounted = new Map<string, number>();
		const views: ClientServerTestView[] = [];
		const errors: unknown[] = [];
		vi.stubGlobal('exactOwnership', {
			open(owner: string, signal: AbortSignal) {
				const result = gate<number>();
				const token = runs.length;
				runs.push({ owner, signal, result, closed: 0 });
				return { token, result: result.promise };
			},
			close(token: number) {
				runs[token]!.closed++;
			},
			mounted(owner: string) {
				mounted.set(owner, (mounted.get(owner) ?? 0) + 1);
			},
			unmounted(owner: string) {
				unmounted.set(owner, (unmounted.get(owner) ?? 0) + 1);
			}
		});
		onTestFinished(async () => {
			for (const view of views) view.unmount();
			for (const run of runs) run.result.resolve(-999);
			await Promise.all(views.map((view) => view.protocol.settle()));
			vi.unstubAllGlobals();
		});
		const root = await createTestWorkspace('.exact-ownership-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		await writeFile(entry, ownershipJourneySource);
		const outDir = path.join(root, 'generated');
		const artifacts = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir,
			serverComponents: true
		});
		const graph = createExactArtifactGraph(artifacts, {
			packageRoot: root,
			sourceRoot: root,
			rootDir: outDir
		});
		const registry = path.join(outDir, 'registration.ts');
		await writeFile(registry, createExactHydrationRegistrationModule(graph));
		const serverModule = await importArtifact(
			artifacts.find((artifact) => artifact.inputFile === entry)!.serverFile,
			path.join(root, 'server.mjs')
		);
		const registryModule = await importArtifact(registry, path.join(root, 'registration.mjs'));
		const registration = registryModule.exactHydrationRegistration as {
			islands: ClientIslandRegistry;
		};
		const Server = serverModule.Shell as AnyComponentFunction;
		const contract = composeExactExecutorContract(
			[Server, serverModule.Panel as AnyComponentFunction],
			{ endpoint: '/__exact' }
		);
		const mount = async (owner: string, delayed = false) => {
			const ready = gate<void>();
			const loads: Promise<unknown>[] = [];
			const islands = Object.fromEntries(
				Object.entries(registration.islands).map(([name, entry]) => [
					name,
					{
						...(typeof entry === 'function' ? {} : entry),
						load() {
							const result = ready.promise.then(() =>
								typeof entry === 'function' ? entry : entry.load()
							);
							loads.push(result);
							return result;
						}
					}
				])
			);
			const server = await renderToHydratableString(
				createCompiledComponentReceipt(Server, { owner })
			);
			expect(unmounted.get(owner)).toBe(1); // SSR releases its own instance.
			const view = await mountClientServerTest({
				server,
				islands,
				settleTasks: false,
				hydrate: {
					...registration,
					endpoint: '/__exact',
					batch,
					onErrorReport: (report) => errors.push(report.error),
					onDiagnostic: (report) => errors.push(report)
				},
				handle: (request) =>
					handleExactRequest(request, {
						contract,
						logger: {
							log(event) {
								if (event.level === 'error') errors.push(event);
							}
						}
					})
			});
			views.push(view);
			if (!delayed) {
				ready.resolve();
				await view.settle();
			}
			return { view, ready, loads };
		};
		const start = async (view: ClientServerTestView, owner: string, name = 'Load') => {
			const before = runs.length;
			await view.getByRole('button', { name }).click({ settleTasks: false });
			await expect
				.poll(() => ({ runs: runs.length, errors }))
				.toEqual({ runs: before + 1, errors: [] });
			expect(runs[before]!.owner).toBe(owner);
			return runs[before]!;
		};
		const cycles = process.env.EXACT_EXTENDED_TESTING === '1' ? 20 : 4;
		for (let cycle = 0; cycle < cycles; cycle++) {
			const left = 'left-' + cycle,
				right = 'right-' + cycle;
			const first = await mount(left),
				second = await mount(right);
			const output = second.view.container.querySelector('output')!;
			const leftRun = await start(first.view, left);
			const oldRight = await start(second.view, right);
			const newRight = await start(second.view, right);
			await expect.poll(() => oldRight.signal.aborted).toBe(true);
			await second.view.getByRole('button', { name: 'Edit' }).click({ settleTasks: false });
			const optimistic = await start(second.view, right + '-optimistic', 'Optimistic');
			first.view.unmount();
			await expect.poll(() => leftRun.signal.aborted).toBe(true);
			expect(newRight.signal.aborted).toBe(false);
			leftRun.result.resolve(999);
			oldRight.result.resolve(999);
			newRight.result.resolve(42 + cycle);
			await expect
				.poll(() => ({ text: output.textContent, errors }))
				.toEqual({ text: `${42 + cycle}:-1:${42 + cycle}:1:3:1:0`, errors: [] });
			await second.view.getByRole('button', { name: 'Cancel' }).click();
			optimistic.result.resolve(999);
			await second.view.settle();
			expect(output.textContent).toBe(`${42 + cycle}:1:${42 + cycle}:1:2:1:0`);
			window.dispatchEvent(new Event('ownership-probe'));
			await second.view.settle();
			expect(output.textContent).toBe(`${42 + cycle}:1:${42 + cycle}:1:2:1:1`);
			expect(second.view.container.querySelector('output')).toBe(output);
			second.view.unmount();
			window.dispatchEvent(new Event('ownership-probe'));
			expect(output.textContent).toBe(`${42 + cycle}:1:${42 + cycle}:1:2:1:1`);
			await Promise.all([first.view.protocol.settle(), second.view.protocol.settle()]);
			await expect.poll(() => runs.every((run) => run.closed === 1)).toBe(true);
			expect(mounted.get(left)).toBe(1);
			expect(unmounted.get(left)).toBe(2);
			expect(mounted.get(right)).toBe(1);
			expect(unmounted.get(right)).toBe(2);
			expect(first.view.client.pendingRequests).toBe(0);
			expect(second.view.client.pendingRequests).toBe(0);
			// Retiring a root before its lazy implementation arrives must not create a new owner.
			const late = await mount('late-' + cycle, true);
			late.view.unmount();
			expect(late.loads.length).toBeGreaterThan(0);
			late.ready.resolve();
			await Promise.all(late.loads);
			await expect(late.view.client.whenSettled()).rejects.toMatchObject({ name: 'AbortError' });
			// Let the released loader and its queued adoption callbacks run after disposal.
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(mounted.has('late-' + cycle)).toBe(false);
			expect(errors).toEqual([]);
		}
	},
	60000
);
