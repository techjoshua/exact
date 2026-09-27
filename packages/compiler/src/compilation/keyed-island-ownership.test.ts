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
import { ownershipPanelSource } from '../test-support/ownership-journey-source.js';

function gate<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

it.each([false, true])(
	'keeps keyed task owners inside their generated parent island (batch=%s)',
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
		await writeFile(
			entry,
			ownershipPanelSource +
				`
export function Shell(this:Component<{ready:boolean}>, props:{owner:string}) {
 function prepare(task:TaskContext=TaskContext.server().blocking()) {this.state.ready=true;}
 prepare(); return () => <Board owner={props.owner}/>;
}
export function Board(this:Component<{rows:{id:string}[]}>,props:{owner:string}) {
 this.state.rows=[{id:'a'},{id:'b'}];
 return () => <article>
  <button onClick={()=>this.state.rows.reverse()}>Reverse</button>
  <button onClick={()=>{this.state.rows=this.state.rows.filter(row=>row.id!=='a');}}>Remove</button>
  <button onClick={()=>this.state.rows.push({id:'a'})}>Restore</button>
  {this.state.rows.map(row=><Panel key={row.id} owner={props.owner+row.id}/>)}
 </article>;
}`
		);
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
			[
				Server,
				serverModule.Board as AnyComponentFunction,
				serverModule.Panel as AnyComponentFunction
			],
			{ endpoint: '/__exact' }
		);
		const mount = async (owner: string) => {
			const server = await renderToHydratableString(
				createCompiledComponentReceipt(Server, { owner })
			);

			const view = await mountClientServerTest({
				server,
				islands: registration.islands,
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
			await view.settle();
			return { view };
		};

		for (let cycle = 0; cycle < 2; cycle++) {
			const name = 'list' + cycle;
			const { view } = await mount(name);
			const rows = [...view.container.querySelectorAll('section')];
			const click = (el: Element, label: string) => {
				[...el.querySelectorAll('button')].find((x) => x.textContent === label)!.click();
			};
			const begin = async (row: Element) => {
				const before = runs.length;
				click(row, 'Load');
				await expect.poll(() => runs.length).toBe(before + 1);
				return runs[before]!;
			};
			const a = await begin(rows[0]),
				b = await begin(rows[1]);
			click(view.container, 'Reverse');
			await expect
				.poll(() => [...view.container.querySelectorAll('section')])
				.toEqual([...rows].reverse());
			expect(a.signal.aborted).toBe(false);
			expect(b.signal.aborted).toBe(false);
			click(view.container, 'Remove');
			await expect.poll(() => a.signal.aborted).toBe(true);
			expect(b.signal.aborted).toBe(false);
			click(view.container, 'Restore');
			await expect.poll(() => view.container.querySelectorAll('section').length).toBe(2);
			const replacement = view.container.querySelectorAll('section')[1];
			expect(replacement).not.toBe(rows[0]);
			const fresh = await begin(replacement);
			const completions: Array<[(typeof runs)[number], number]> = [
				[a, 999],
				[fresh, 17],
				[b, 23]
			];
			if (cycle % 2 === 0) completions.reverse();
			for (const [run, value] of completions) run.result.resolve(value);
			await view.settle();
			expect([...view.container.querySelectorAll('output')].map((x) => x.textContent)).toEqual([
				'23:0:23:0:1:1:0',
				'17:0:17:0:1:1:0'
			]);
			expect(view.container.querySelector('section')).toBe(rows[1]);
			view.unmount();
			await view.protocol.settle();
			expect(runs.every((run) => run.closed === 1)).toBe(true);
			expect(errors).toEqual([]);
			expect(mounted.get(name + 'a')).toBe(2);
			expect(mounted.get(name + 'b')).toBe(1);
			expect(unmounted.get(name + 'a')).toBe(3);
			expect(unmounted.get(name + 'b')).toBe(2);
		}
	},
	60000
);
