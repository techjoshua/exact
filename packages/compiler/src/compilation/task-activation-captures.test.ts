/** @vitest-environment jsdom */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import { withComponentDomain, type AnyComponentFunction, type ContextToken } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { mountClientServerTest } from '@exactjs/testing';
import { renderToString } from '@exactjs/ssr';
import {
	createExactContextRuntime,
	composeExactExecutorContract,
	handleExactRequest,
	exactResponseToFetchResponse
} from '@exactjs/server';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each([
	{ name: 'void', statement: '', value: undefined, mode: 'body' },
	{ name: 'undefined', statement: 'return undefined;', value: undefined, mode: 'body' },
	{ name: 'null', statement: 'return null;', value: null, mode: 'body' },
	{ name: 'number', statement: 'return result;', value: 'result', mode: 'body' },
	{ name: 'false', statement: 'return false;', value: false, mode: 'body' },
	{ name: 'zero', statement: 'return 0;', value: 0, mode: 'body' },
	{ name: 'direct context default', statement: '', value: undefined, mode: 'direct' },
	{ name: 'aliased context default', statement: '', value: undefined, mode: 'alias' },
	{ name: 'helper context read', statement: '', value: undefined, mode: 'helper-read' },
	{ name: 'helper context write', statement: '', value: undefined, mode: 'helper-write' }
])(
	'preserves captured defaults with local helpers and server context ($name result)',
	async ({ statement, value, mode }) => {
		const root = await createTestWorkspace('.exact-activation-captures-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		let source = await readFile(
			path.resolve(
				'packages/component-composition-corpus/src/test-support/task-activation-captures.fixtures.tsx'
			),
			'utf8'
		);
		for (const anchor of [
			'props.input + this.state.draft',
			'const read = () => this.state.revision;',
			' + shared + privateValue',
			'this.setContext(CaptureStatus, { value: result });',
			'this.state.result = result;'
		])
			expect(source).toContain(anchor);

		const capturedContext = mode === 'direct' || mode === 'alias';
		const initial = capturedContext ? 19 : 24;
		if (capturedContext)
			source = source
				.replace(
					'props.input + this.state.draft',
					`${mode === 'direct' ? 'this.getContext(CaptureShared)' : 'shared'} + props.input + this.state.draft - 5`
				)
				.replace(' + shared + privateValue', ' + privateValue');
		if (mode === 'helper-read')
			source = source
				.replace(
					'const read = () => this.state.revision;',
					'const read = () => this.state.revision + shared;'
				)
				.replace(' + shared + privateValue', ' + privateValue');
		if (mode === 'helper-write')
			source = source
				.replace(
					'const read = () => this.state.revision;',
					'const read = () => this.state.revision;const publish=(value:number)=>this.setContext(CaptureStatus,{value});'
				)
				.replace('this.setContext(CaptureStatus, { value: result });', 'publish(result);');

		await writeFile(
			entry,
			source.replace('this.state.result = result;', `this.state.result = result;${statement}`)
		);
		const [artifact] = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, 'generated'),
			instrumentInspection: true,
			generatedValidation: 'semantic'
		});
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const Client = client.ActivationCaptureShell as AnyComponentFunction;
		const Server = server.ActivationCaptureShell as AnyComponentFunction;
		const serverComponents = [
			Server,
			server.ActivationCaptureInputs as AnyComponentFunction,
			server.CaptureStatusView as AnyComponentFunction
		];
		const clientComponents = [
			Client,
			client.ActivationCaptureInputs as AnyComponentFunction,
			client.CaptureStatusView as AnyComponentFunction
		];
		const output = await renderToString(receipt(Server, {}), {
			contexts: new Map([[(server.CapturePrivate as ContextToken<number>).id, 7]])
		});
		const host = document.createElement('div');
		host.innerHTML = output.html;
		expect(host.querySelector('[data-result]')?.textContent).toBe(String(initial));
		expect(host.querySelector('[data-status]')?.textContent).toBe(String(initial));

		const contract = composeExactExecutorContract(serverComponents);
		const contextRuntime = createExactContextRuntime({
			requestContexts: [[server.CapturePrivate as ContextToken<number>, { value: 7 }]]
		});
		onTestFinished(() => contextRuntime.dispose());
		const reports: unknown[] = [];
		let requests = 0;
		host.innerHTML = '';
		const view = await mountClientServerTest({
			container: host,
			server: { html: '' },
			islands: {},
			hydrate: {
				...composeExactComponentContracts(clientComponents, 'client'),
				resumptions: [],
				publicContexts: capturedContext ? {} : { CaptureShared: 5 },
				endpoint: '/__exact',
				batch: false,
				onErrorReport: (report) => reports.push(report.error),
				onDiagnostic: (report) => reports.push(report)
			},
			handle: async (request) => {
				requests++;
				const response = await handleExactRequest(request, {
					contract,
					contextRuntime,
					logger: {
						log: (event) => {
							if (event.level === 'error' || event.level === 'warn') reports.push(event);
						}
					}
				});
				const fetchResponse = exactResponseToFetchResponse(response);
				const result = await fetchResponse.clone().json();
				expect(response.status).toBe(200);
				if (value === undefined) expect(Object.hasOwn(result, 'value')).toBe(false);
				else expect(result.value).toBe(value === 'result' ? result.state.result : value);
				return response;
			}
		});
		onTestFinished(() => {
			view.unmount();
			unmount(host);
		});
		render(
			withComponentDomain(view.client.domain, () => receipt(Client, {})),
			host,
			{
				componentDomain: view.client.domain,
				onErrorReport: (report) => reports.push(report.error)
			}
		);
		const result = host.querySelector('[data-result]');
		const status = host.querySelector('[data-status]');
		const run = host.querySelector<HTMLButtonElement>('[data-run]')!;
		await view.settle();
		expect(reports).toEqual([]);
		await view.action(() => run.click());
		await expect.poll(() => result?.textContent).toBe(String(initial));
		expect(status?.textContent).toBe(String(initial));
		expect(reports).toEqual([]);
		for (const expected of [String(initial + 2), String(initial + 4)]) {
			const before = requests;
			await view.action(() =>
				host.querySelector<HTMLButtonElement>('[data-capture-only]')!.click()
			);
			await view.settle();
			expect(requests).toBe(before);
			expect(result?.textContent).toBe(String(Number(expected) - 2));
			await view.action(() => run.click());
			expect(requests).toBeGreaterThan(before);
			await expect.poll(() => result?.textContent).toBe(expected);
			expect(status?.textContent).toBe(expected);
			expect(reports).toEqual([]);
			expect(host.querySelector('[data-result]')).toBe(result);
		}
		await view.action(() => host.querySelector<HTMLButtonElement>('[data-props]')!.click());
		await view.settle();
		await view.action(() => run.click());
		await expect.poll(() => result?.textContent).toBe(String(initial + 6));
		expect(host.querySelector('[data-result]')).toBe(result);
		expect(reports).toEqual([]);
		await view.action(() => host.querySelector<HTMLButtonElement>('[data-next]')!.click());
		await view.settle();
		await view.action(() => run.click());
		await expect.poll(() => result?.textContent).toBe(String(initial + 7));
		expect(status?.textContent).toBe(String(initial + 7));
		await view.action(() => host.querySelector<HTMLButtonElement>('[data-remove]')!.click());
		await view.settle();
		await expect.poll(() => host.querySelector('[data-result]')).toBeNull();
		const before = requests;
		await view.action(() => run.click());
		expect(requests).toBe(before);
		expect(reports).toEqual([]);
	}
);
