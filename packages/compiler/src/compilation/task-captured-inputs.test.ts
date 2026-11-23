/** @vitest-environment jsdom */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import { withComponentDomain, type AnyComponentFunction } from '@exactjs/core';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { renderToHydratableString } from '@exactjs/ssr';
import { composeExactExecutorContract, handleExactRequest } from '@exactjs/server';
import { mountClientServerTest, type ClientServerTestView } from '@exactjs/testing';
import {
	compileProjectArtifacts,
	createExactArtifactGraph,
	createExactHydrationRegistrationModule
} from '../index.js';
import { createCompilerTestWorkspace, repositoryPath } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
it.each([
	{ placement: 'client', mode: 'mount' },
	{ placement: 'client', mode: 'hydrate' },
	{ placement: 'server', mode: 'hydrate' }
])(
	'preserves captured types and selector execution across retained updates ($placement/$mode)',
	async ({ placement, mode }) => {
		const root = await createCompilerTestWorkspace('.exact-task-captured-inputs-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		const source = await readFile(
			repositoryPath(
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

it('reads a transported prop inside an invoked task that calls a state helper', async () => {
	const root = await createCompilerTestWorkspace('.exact-task-helper-input-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	await writeFile(
		entry,
		`import {TaskContext, type Component} from '@exactjs/core';
function label(value: string | number) { return String(value).trim(); }
export function Page(this: Component<{label:string}>, props: {input:string | number}) {
	this.state.label = '';
	const run = (task:TaskContext = TaskContext.server()) => {
		this.state.label = label(props.input);
		return this.state.label;
	};
	return () => <button onClick={() => run()}>{this.state.label}</button>;
}`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated'),
		generatedValidation: 'semantic'
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const contract = composeExactExecutorContract([server.Page as AnyComponentFunction]);
	const operations = Object.values(contract.invocations);
	expect(operations).toHaveLength(1);
	const [operation] = operations;
	expect(operation!.dependencies.map((input) => input.source)).toEqual(['props']);
	const response = await handleExactRequest(
		{
			method: 'POST',
			url: 'http://localhost/__exact',
			headers: { origin: 'http://localhost', 'content-type': 'application/json' },
			body: {
				type: 'invoke',
				id: operation!.id,
				state: { label: '' },
				payload: { generation: 1, dependencies: ['  captured  '] }
			}
		},
		{ contract, invocations: {} }
	);
	expect(response.status).toBe(200);
	expect(JSON.parse(response.body as string)).toMatchObject({
		ok: true,
		value: 'captured',
		state: { label: 'captured' }
	});
});

it.each([
	{ mode: 'closure', firstResult: 'first:original', secondResult: 'second:original' },
	{ mode: 'argument', firstResult: 'first:original', secondResult: 'second:original' },
	{
		mode: 'task-body-write',
		firstResult: 'original:original:executor',
		secondResult: 'original:original:executor'
	},
	{ mode: 'argument-prefix', update: '++value', firstResult: '2:1', secondResult: '3:1' },
	{ mode: 'prefix-increment', update: '++(value)', firstResult: '2:1', secondResult: '3:1' },
	{ mode: 'compound-write', update: 'value += 1', firstResult: '4:1:9', secondResult: '5:1:9' },
	{ mode: 'inner-shadow', update: 'void 0', firstResult: '1:1', secondResult: '1:1' },
	{ mode: 'mixed-write', update: 'value++', firstResult: '3:1', secondResult: '4:1' },
	{ mode: 'shorthand-increment', update: 'value++', firstResult: '2:1', secondResult: '3:1' },
	{ mode: 'postfix-increment', update: 'value++', firstResult: '2:1', secondResult: '3:1' },
	{ mode: 'prefix-decrement', update: '--value', firstResult: '0:1', secondResult: '-1:1' },
	{ mode: 'postfix-decrement', update: '(value)--', firstResult: '0:1', secondResult: '-1:1' },
	{
		mode: 'shadow-update',
		update: '{ let value = 10; value++; }',
		firstResult: '1:1',
		secondResult: '1:1'
	}
])(
	'sends the current replacement for a context binding with $mode',
	async ({ mode, update, firstResult, secondResult }) => {
		const argument = mode === 'argument' || mode === 'argument-prefix';
		const bodyWrite = mode === 'task-body-write';
		const beforeResult =
			mode === 'compound-write'
				? 'value += 2; const selected = {value}; const ordinary = {value:9};'
				: mode === 'mixed-write'
					? 'value++;'
					: mode === 'inner-shadow'
						? '{const value=0; void value;}'
						: '';
		const initial = update ? 1 : ' original ';
		const initialSource = JSON.stringify(initial);
		const firstUpdate = update ?? "value = ' first '";
		const secondUpdate = update ?? "value = ' second '";
		const argumentType = update ? 'number' : 'Trimmable';
		const receiver = argument
			? 'current'
			: mode === 'shorthand-increment'
				? '({value}).value'
				: 'value';
		const resultExpression = update
			? mode === 'compound-write'
				? "String(selected.value) + ':' + this.getContext(Role) + ':' + ordinary.value"
				: `String(${receiver}) + ':' + this.getContext(Role)`
			: `${receiver}.trim() + ':' + this.getContext(Role).trim()`;
		const root = await createCompilerTestWorkspace(
			'.exact-task-context-replacement-',
			process.cwd()
		);
		const entry = path.join(root, 'page.tsx');
		await writeFile(
			entry,
			`import {createContext, TaskContext, type Component} from '@exactjs/core';
interface Trimmable { trim(): string }
const Role = createContext<${argumentType}>('role', {keep:'shared'});
export function Reader(this: Component<{result:string}>) {
	this.state.result = '';
	let value = this.getContext(Role);
	const run = (${argument ? `current: ${argumentType}, ` : ''}task: TaskContext = TaskContext.server().blocking()) => {
		${beforeResult}
		const result = ${resultExpression};
		${bodyWrite ? "value = ' executor '; return result + ':' + value.trim();" : 'return result;'}
	};
	return () => <div>
		${
			bodyWrite
				? ''
				: `<button data-first onClick={() => { ${firstUpdate}; }}>First</button>
		<button data-second onClick={() => { ${secondUpdate}; }}>Second</button>`
		}
		<button data-run onClick={async () => { this.state.result = await run(${argument ? 'value' : ''}); }}>Run</button>
		<output>{this.state.result}</output>
	</div>;
}
export function Page(this: Component<{}>) {
	this.setContext(Role, ${initialSource});
	return () => <Reader/>;
}`
		);
		const outDir = path.join(root, 'generated');
		const artifacts = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir,
			generatedValidation: 'semantic'
		});
		const [artifact] = artifacts;
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const Client = client.Page as AnyComponentFunction;
		const contract = composeExactExecutorContract([
			server.Page as AnyComponentFunction,
			server.Reader as AnyComponentFunction
		]);
		const host = document.createElement('div');
		const reports: unknown[] = [];
		let requests = 0;
		let releaseFirstDispatch = () => {};
		const firstDispatchGate = new Promise<void>((resolve) => {
			releaseFirstDispatch = resolve;
		});
		const view = await mountClientServerTest({
			container: host,
			server: { html: '' },
			islands: {},
			hydrate: {
				...composeExactComponentContracts(
					[Client, client.Reader as AnyComponentFunction],
					'client'
				),
				resumptions: [],
				publicContexts: { Role: initial },
				batch: false,
				endpoint: '/__exact',
				onMismatch: 'throw',
				onErrorReport: (report) => reports.push(report.error),
				onDiagnostic: (report) => reports.push(report)
			},
			handle: async (request) => {
				if (++requests === 1) await firstDispatchGate;
				const response = await handleExactRequest(request, { contract });
				expect(response.status).toBe(200);
				return response;
			}
		});
		onTestFinished(() => {
			releaseFirstDispatch();
			view.unmount();
			unmount(host);
		});
		render(
			withComponentDomain(view.client.domain, () => receipt(Client, {})),
			host
		);
		await view.settle();
		const run = host.querySelector<HTMLButtonElement>('[data-run]')!;
		const first = host.querySelector<HTMLButtonElement>('[data-first]')!;
		const second = host.querySelector<HTMLButtonElement>('[data-second]')!;
		const output = host.querySelector('output');
		if (first) await view.action(() => first.click());
		await view.action(() => run.click(), { settleTasks: false });
		await expect.poll(() => requests).toBe(1);
		if (second) await view.action(() => second.click(), { settleTasks: false });
		releaseFirstDispatch();
		await view.settle();
		await expect.poll(() => output?.textContent).toBe(firstResult);
		await view.action(() => run.click());
		await expect.poll(() => output?.textContent).toBe(secondResult);
		expect(requests).toBe(2);
		expect(reports).toEqual([]);
	}
);
