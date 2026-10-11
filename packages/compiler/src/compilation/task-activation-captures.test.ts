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
	{
		name: 'destructured server optimistic context',
		statement: '',
		value: undefined,
		mode: 'destructured-optimistic'
	},
	{
		name: 'ordinary awaited subscription result',
		statement: '',
		value: undefined,
		mode: 'ordinary-subscribe'
	},
	{ name: 'void', statement: '', value: undefined, mode: 'body' },
	{ name: 'undefined', statement: 'return undefined;', value: undefined, mode: 'body' },
	{ name: 'null', statement: 'return null;', value: null, mode: 'body' },
	{ name: 'number', statement: 'return result;', value: 'result', mode: 'body' },
	{ name: 'false', statement: 'return false;', value: false, mode: 'body' },
	{ name: 'zero', statement: 'return 0;', value: 0, mode: 'body' },
	{ name: 'direct context default', statement: '', value: undefined, mode: 'direct' },
	{ name: 'aliased context default', statement: '', value: undefined, mode: 'alias' },
	{ name: 'helper context read', statement: '', value: undefined, mode: 'helper-read' },
	{ name: 'helper context write', statement: '', value: undefined, mode: 'helper-write' },
	{ name: 'awaited server resource', statement: '', value: undefined, mode: 'resource-awaited' },
	{ name: 'wrapped server resource', statement: '', value: undefined, mode: 'resource-wrapped' },
	{
		name: 'explicit server resource release',
		statement: '',
		value: undefined,
		mode: 'resource-release'
	},
	{
		name: 'optional server resource release',
		statement: '',
		value: undefined,
		mode: 'resource-optional'
	},
	{
		name: 'server subscription resource',
		statement: '',
		value: undefined,
		mode: 'resource-subscription'
	},
	{
		name: 'server task signal injection',
		statement: '',
		value: undefined,
		mode: 'resource-signal'
	},
	{ name: 'server timer cancellation', statement: '', value: undefined, mode: 'resource-timer' },
	{ name: 'nested server resource', statement: '', value: undefined, mode: 'resource-nested' },
	{ name: 'helper tuple spread', statement: '', value: undefined, mode: 'helper-spread' },
	{ name: 'helper derived scalar', statement: '', value: undefined, mode: 'helper-derived' },
	{ name: 'helper derived object', statement: '', value: undefined, mode: 'helper-derived-object' },
	{ name: 'helper constant', statement: '', value: undefined, mode: 'helper-constant' },
	{
		name: 'nullable server collection',
		statement: '',
		value: undefined,
		mode: 'nullable-collection'
	},
	{
		name: 'absent nullable server collection',
		statement: '',
		value: undefined,
		mode: 'nullable-absent'
	},
	{ name: 'null server collection', statement: '', value: undefined, mode: 'nullable-null' },
	{
		name: 'optional null server receiver',
		statement: '',
		value: undefined,
		mode: 'nullable-optional'
	},
	{
		name: 'optional null parameter helper',
		statement: '',
		value: undefined,
		mode: 'nullable-parameter'
	},
	{
		name: 'parenthesized helper capture',
		statement: '',
		value: undefined,
		mode: 'helper-parenthesized'
	},
	{ name: 'asserted helper capture', statement: '', value: undefined, mode: 'helper-asserted' },
	{ name: 'helper object', statement: '', value: undefined, mode: 'helper-object' },
	{ name: 'helper overload', statement: '', value: undefined, mode: 'helper-overload' },
	{ name: 'helper block shadow', statement: '', value: undefined, mode: 'helper-shadow' },
	{ name: 'helper props', statement: '', value: undefined, mode: 'helper-props' },
	{ name: 'immediate context helper', statement: '', value: undefined, mode: 'helper-immediate' },
	{
		name: 'helper nested state alias',
		statement: '',
		value: undefined,
		mode: 'helper-state-alias'
	},
	{ name: 'unused context helper', statement: '', value: undefined, mode: 'helper-unused' }
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

		if (mode === 'destructured-optimistic')
			source = source
				.replace('TaskContext.server().blocking()', 'TaskContext.server().latest().blocking()')
				.replace('task: TaskContext', '{optimistic}: TaskContext')
				.replace('void task;', 'void optimistic;optimistic(()=>{this.state.result=-1;});');
		if (mode === 'ordinary-subscribe')
			source =
				'async function subscribe(){return 1;}\n' +
				source
					.replace('const run = (', 'const run = async (')
					.replace('void task;', 'void task;await subscribe();');
		const capturedContext = mode === 'direct' || mode === 'alias';
		const helperValue = [
			'helper-constant',
			'helper-parenthesized',
			'helper-asserted',
			'helper-object',
			'helper-shadow',
			'helper-spread',
			'helper-derived',
			'helper-derived-object'
		].includes(mode);
		const initial = capturedContext ? 19 : mode === 'helper-props' ? 27 : helperValue ? 26 : 24;
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

		const helperVariants: Record<string, string> = {
			'helper-constant': 'const offset=2;const read=()=>this.state.revision+offset;',
			'helper-parenthesized': 'const offset=2;const read=((()=>this.state.revision+offset));',
			'helper-asserted':
				'const offset=2;const read=(()=>this.state.revision+offset) as (()=>number);',
			'helper-object':
				'const settings={offset:2};const read=()=>this.state.revision+settings.offset;',
			'helper-overload':
				'function value(input:number):number;function value(input:string):number;function value(input:number|string){return Number(input);}const read=()=>value(this.state.revision);',
			'helper-shadow':
				'const offset=2;const read=()=>{if(this.state.revision){const offset=3;void offset;}return this.state.revision+offset;};',
			'helper-props': 'const read=()=>this.state.revision+props.input;',
			'helper-immediate':
				'const read=()=>this.state.revision+(()=>this.getContext(CaptureShared))();',
			'helper-state-alias': 'const owner=this.state.nested;const read=()=>owner.revision;',
			'helper-spread': 'const offset=2;const read=()=>this.state.revision+offset;',
			'helper-derived':
				'const offset=this.state.revision+1;const read=()=>this.state.revision+offset;',
			'helper-derived-object':
				'const settings={offset:this.state.revision+1};const read=()=>this.state.revision+settings.offset;',
			'helper-unused':
				'const read=()=>{const unused=()=>this.getContext(CaptureShared);void unused;return this.state.revision;};'
		};
		if (helperVariants[mode])
			source = source.replace('const read = () => this.state.revision;', helperVariants[mode]);
		if (mode === 'helper-immediate')
			source = source.replace(' + shared + privateValue', ' + privateValue');

		if (mode.startsWith('nullable-'))
			source = source
				.replace('result: number }', 'result: number;nested?:{lookup:Map<string,number>} }')
				.replace(
					'this.state.result = 0;',
					"this.state.result=0;this.state.nested={lookup:new Map([['result',0]])};"
				)
				.replace('const run = (', 'async function run(')
				.replace(') => {\n\t\tvoid task;', ') {\n\t\tvoid task;')
				.replace(
					'this.state.result = result;',
					"if(this.state.nested){this.state.nested.lookup.set('result',result);}this.state.result=result;"
				)
				.replace(
					'<output data-result>',
					"<output data-collection>{this.state.nested?.lookup.get('result')}</output><output data-result>"
				);

		if (mode === 'nullable-absent')
			source = source.replace(
				"this.state.nested={lookup:new Map([['result',0]])};",
				'this.state.nested=undefined;'
			);
		if (['nullable-null', 'nullable-optional', 'nullable-parameter'].includes(mode))
			source = source
				.replace('nested?:{lookup:Map<string,number>}', 'nested:{lookup:Map<string,number>}|null')
				.replace("this.state.nested={lookup:new Map([['result',0]])};", 'this.state.nested=null;');
		if (['nullable-optional', 'nullable-parameter'].includes(mode)) {
			const read =
				mode === 'nullable-optional'
					? "(this.state.nested?.lookup.get('missing')??0)"
					: 'readOptional(this.state.nested)';
			source = source.replace(
				"if(this.state.nested){this.state.nested.lookup.set('result',result);}this.state.result=result;",
				'this.state.result=result+' + read + ';'
			);
			if (mode === 'nullable-parameter')
				source =
					"function readOptional(value:{lookup:Map<string,number>}|null){return value?.lookup.get('missing')??0;}\n" +
					source;
		}
		if (mode === 'helper-state-alias')
			source = source
				.replace('result: number }', 'result: number;nested:{revision:number} }')
				.replace(
					'this.state.revision = 1;',
					'this.state.revision=1;this.state.nested={revision:1};'
				)
				.replace(
					'onClick={() => this.state.revision++}',
					'onClick={()=>{this.state.revision++;this.state.nested={revision:this.state.nested.revision+1};}}'
				);
		if (mode === 'helper-spread')
			source = source.replace('void run();', 'void run(...([5] as [number]));');

		const resourceMode = mode.startsWith('resource-');
		if (resourceMode) {
			source =
				'export let disposed=0;class Resource{dispose(){disposed++;}}/** @exact cleanup=dispose */ async function acquire(){await Promise.resolve();return new Resource();}\n' +
				source;
			source = source
				.replace('const run = (', 'const run = async (')
				.replace(
					'void task;',
					`void task;const resource=${mode === 'resource-wrapped' ? 'await (acquire())' : 'await acquire()'};void resource;`
				);
		}

		if (mode === 'resource-nested')
			source = source.replace(
				'const resource=await acquire();void resource;',
				'const readResource=async()=>{const resource=await acquire();void resource;};await readResource();'
			);

		if (mode === 'resource-release')
			source = source.replace('void resource;', 'resource.dispose();');
		if (mode === 'resource-optional')
			source = source.replace('void resource;', 'resource.dispose?.();');
		if (mode === 'resource-subscription')
			source = source.replace(
				'const resource=await acquire();void resource;',
				'const store={subscribe(){return ()=>{disposed++;};}};const unsubscribe=store.subscribe();void unsubscribe;'
			);
		if (mode === 'resource-signal')
			source =
				'async function selected(signal?:AbortSignal){if(!(signal instanceof AbortSignal))throw new Error("missing task signal");}\n' +
				source.replace('void resource;', 'void resource;await selected();');
		if (mode === 'resource-timer')
			source = source.replace(
				'void resource;',
				'void resource;const handle=setTimeout(()=>{throw new Error("retired timer executed");},1000);clearTimeout(handle);'
			);

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
				if (mode === 'nullable-absent') {
					expect(response.status).toBe(400);
					expect(result).toEqual({ error: 'bad_request' });
					return response;
				}
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
		if (mode === 'nullable-absent') {
			expect(requests).toBeGreaterThan(0);
			expect(reports).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						message: 'rejected exact invocation with mismatched state contract'
					})
				])
			);
			expect(result?.textContent).toBe('0');
			expect(host.querySelector('[data-run]')).toBe(run);
			return;
		}
		expect(reports).toEqual([]);
		await view.action(() => run.click());
		await expect.poll(() => result?.textContent).toBe(String(initial));
		if (mode === 'nullable-absent' || mode === 'nullable-null')
			expect(host.querySelector('[data-collection]')?.textContent).toBe('');
		if (mode.endsWith('collection'))
			expect(host.querySelector('[data-collection]')?.textContent).toBe(String(initial));
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
		await expect
			.poll(() => result?.textContent)
			.toBe(String(initial + (mode === 'helper-props' ? 7 : 6)));
		expect(host.querySelector('[data-result]')).toBe(result);
		expect(reports).toEqual([]);
		await view.action(() => host.querySelector<HTMLButtonElement>('[data-next]')!.click());
		await view.settle();
		await view.action(() => run.click());
		await expect
			.poll(() => result?.textContent)
			.toBe(
				String(
					initial +
						(['helper-props', 'helper-derived', 'helper-derived-object'].includes(mode) ? 8 : 7)
				)
			);
		expect(status?.textContent).toBe(
			String(
				initial +
					(['helper-props', 'helper-derived', 'helper-derived-object'].includes(mode) ? 8 : 7)
			)
		);
		if (mode === 'nullable-absent' || mode === 'nullable-null')
			expect(host.querySelector('[data-collection]')?.textContent).toBe('');
		if (mode.endsWith('collection'))
			expect(host.querySelector('[data-collection]')?.textContent).toBe(String(initial + 7));
		await view.action(() => host.querySelector<HTMLButtonElement>('[data-remove]')!.click());
		await view.settle();
		await expect.poll(() => host.querySelector('[data-result]')).toBeNull();
		const before = requests;
		await view.action(() => run.click());
		expect(requests).toBe(before);
		expect(reports).toEqual([]);
		if (resourceMode) await expect.poll(() => server.disposed).toBe(requests + 1);
	}
);
