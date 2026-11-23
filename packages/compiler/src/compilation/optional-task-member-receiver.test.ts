/** @vitest-environment jsdom */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import { withComponentDomain, type AnyComponentFunction } from '@exactjs/core';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { composeExactExecutorContract, handleExactRequest } from '@exactjs/server';
import { mountClientServerTest } from '@exactjs/testing';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
it.each([
	{
		access: 'named',
		expression: 'this.state.item!.trim?.(argument())',
		input: "' first '",
		expected: 'first:1'
	},
	{
		access: 'indexed',
		expression: 'this.state.item!["trim"]?.(argument())',
		input: "' first '",
		expected: 'first:1'
	},
	{
		access: 'alias',
		expression: 'item.trim?.(argument())',
		input: "' first '",
		expected: 'first:1'
	},
	{
		access: 'parentheses',
		expression: '(item.trim)?.(argument())',
		input: "' first '",
		expected: 'first:1'
	},
	{
		access: 'direct-parentheses',
		expression: '(this.state.item!.trim)?.(argument())',
		input: "' first '",
		expected: 'first:1'
	},
	{
		access: 'non-null',
		expression: 'item.trim!?.(argument())',
		input: "' first '",
		expected: 'first:1'
	},
	{
		access: 'assertion',
		expression: '(item.trim as Trimmable["trim"])?.(argument())',
		input: "' first '",
		expected: 'first:1'
	},
	{
		access: 'satisfies',
		expression: '(item.trim satisfies Trimmable["trim"])?.(argument())',
		input: "' first '",
		expected: 'first:1'
	},
	{
		access: 'wrapped-absent',
		expression: '((item.trim as Trimmable["trim"])!)?.(argument())',
		input: '{}',
		expected: 'missing:0'
	},
	{
		access: 'detached',
		expression: '(0 as unknown, item.trim)?.(argument())',
		input: "' first '",
		expected: 'caught:1'
	},
	{
		access: 'grouped-present',
		expression: '(item?.trim)?.(argument())',
		input: "' first '",
		expected: 'first:1'
	},
	{
		access: 'grouped-absent',
		expression: '(item?.trim)?.(argument())',
		input: 'undefined',
		expected: 'missing:0'
	},
	{
		access: 'boundary',
		expression: 'String((item?.trim?.(argument()))!.length)',
		input: 'undefined',
		expected: 'caught:0'
	},
	{
		access: 'helper',
		expression: '(helper)?.((undefined as { text: string } | undefined)?.text ?? argument())',
		input: '{}',
		expected: 'input:1'
	}
])(
	'preserves optional task method receivers ($access)',
	async ({ access, expression, input, expected }) => {
		const root = await createCompilerTestWorkspace('.exact-optional-task-member-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		await writeFile(
			entry,
			`import {TaskContext, type Component} from '@exactjs/core';
interface Trimmable { trim?(input?:string): string }
export function Reader(this: Component<{result:string; rows:number[]; item:Trimmable | undefined}>) {
	this.state.result = '';
	this.state.rows = [1];
	this.state.item = {};
	const run = (task: TaskContext = TaskContext.server().blocking()) => {
		this.state.rows.push(2);
		const inspect = (rows: number[]) => rows.length;
		inspect(this.state.rows);
		let evaluations = 0;
		const argument = () => { evaluations++; return 'input'; };
		const helper = (text: string) => text;
		${access === 'direct-parentheses' ? '' : `const item = this.state.item${access.startsWith('grouped') || access === 'boundary' ? '' : '!'};`}
		try {
			const result = ${expression};
			return (result ?? 'missing') + ':' + evaluations;
		} catch {
			return 'caught:' + evaluations;
		}
	};
	return () => <div>
		<button data-run onClick={async () => {
			this.state.item = ${input};
			this.state.result = await run();
		}}>Run</button>
		<output>{this.state.result}</output>
	</div>;
}
export function Page(this: Component<{}>) { return () => <Reader/>; }`
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
				batch: false,
				endpoint: '/__exact',
				onMismatch: 'throw',
				onErrorReport: (report) => reports.push(report.error),
				onDiagnostic: (report) => reports.push(report)
			},
			handle: async (request) => {
				requests++;
				expect((request.body as { arrayCompletion?: number }).arrayCompletion).toBe(4);
				const response = await handleExactRequest(request, { contract });
				expect(response.status).toBe(200);
				return response;
			}
		});
		onTestFinished(() => {
			view.unmount();
			unmount(host);
		});
		render(
			withComponentDomain(view.client.domain, () => receipt(Client, {})),
			host
		);
		await view.settle();
		const run = host.querySelector<HTMLButtonElement>('[data-run]')!;
		const output = host.querySelector('output');
		await view.action(() => run.click());
		await expect.poll(() => output?.textContent).toBe(expected);
		expect(requests).toBe(1);
		expect(reports).toEqual([]);
	}
);
