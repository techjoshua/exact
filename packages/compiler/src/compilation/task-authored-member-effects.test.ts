/** @vitest-environment jsdom */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString, renderToString } from '@exactjs/ssr';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import {
	composeExactExecutorContract,
	exactResponseToFetchResponse,
	handleExactRequest
} from '@exactjs/server';
import { compileProjectArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createBrowserTestWorkspace } from '../test-support/workspace.js';

const probes: {
	name: string;
	body: string;
	trace: string[];
	output?: string;
	browserOutput?: string;
	serverExecution?: boolean;
}[] = [
	{
		name: 'inherited getter',
		body: `
			const prototype = {
				get value(): string {
					trace.push(this === created ? 'getter:receiver' : 'getter:wrong receiver');
					return window.name;
				}
			};
			const created: typeof prototype = Object.freeze(Object.create(prototype));
			this.state.label = created.value;
		`,
		trace: ['getter:receiver']
	},
	{
		name: 'inherited method',
		body: `
			const prototype = {
				value(): string {
					trace.push(this === created ? 'method:receiver' : 'method:wrong receiver');
					return window.name;
				}
			};
			const created: typeof prototype = Object.create(prototype);
			this.state.label = created.value();
		`,
		trace: ['method:receiver']
	},
	{
		name: 'dormant prototype during construction',
		body: `
			const created = Object.freeze(Object.create({
				get value(): string {
					trace.push('unexpected getter');
					return window.name;
				}
			}));
			this.state.label = Object.isFrozen(created) ? 'ready' : 'missing';
		`,
		trace: [],
		output: 'ready'
	},
	{
		name: 'own data shadows the prototype getter',
		body: `
			const created = Object.create({
				get value(): string {
					trace.push('unexpected getter');
					return window.name;
				}
			}, { value: { value: 'own' } }) as { value: string };
			this.state.label = created.value;
		`,
		trace: [],
		output: 'own'
	},
	{
		name: 'own callable shadows the prototype method',
		body: `
			const created = Object.create({
				value(): string {
					trace.push('unexpected method');
					return window.name;
				}
			}, { value: { value: () => 'own' } }) as { value(): string };
			this.state.label = created.value();
		`,
		trace: [],
		output: 'own'
	},
	...(
		[
			['call', 'callback.call(receiver, first(), second())'],
			['apply', 'callback.apply(receiver, [first(), second()])'],
			['Reflect.apply', 'Reflect.apply(callback, receiver, [first(), second()])'],
			['conditional Reflect.apply', 'Reflect.apply(selected, receiver, [first(), second()])'],
			['conditional call', 'selected.call(receiver, first(), second())'],
			['bind', 'bound(second())']
		] as const
	).map(([adapter, invocation]) => ({
		name: `stored descriptor callback via ${adapter}`,
		body: `
			const receiver = { prefix: 'from ' };
			const target = {
				value(this: typeof receiver, a: string, b: string) {
					trace.push(this === receiver ? 'callback:receiver' : 'callback:wrong receiver');
					return this.prefix + a + b + window.name;
				}
			};
			const callback = Object.getOwnPropertyDescriptor(target, 'value')!.value as typeof target.value;
			function first() { trace.push('first'); return 'the '; }
			function second() { trace.push('second'); return 'client: '; }
			${adapter.startsWith('conditional') ? 'const selected = trace.length > 0 ? callback : foreign;' : ''}
			${adapter === 'bind' ? "const bound = callback.bind(receiver, first()); trace.push('bound');" : ''}
			this.state.label = ${invocation};
		`,
		trace:
			adapter === 'bind'
				? ['first', 'bound', 'second', 'callback:receiver']
				: ['first', 'second', 'callback:receiver'],
		browserOutput: 'from the client: from browser'
	})),
	{
		name: 'conditional stored callback without an adapter',
		body: `
			const target = { value: () => document.title };
			const callback = Object.getOwnPropertyDescriptor(target, 'value')!.value as typeof target.value;
			const selected = trace.length > 0 ? callback : () => 'other';
			this.state.label = selected();
		`,
		trace: []
	},
	{
		name: 'Reflect.apply routes the selected receiver and positional values',
		body: `
			const receiver = { get label() { trace.push('receiver read'); return document.title; } };
			const input = { get suffix() { trace.push('argument read'); return window.name; } };
			const target = {
				value(this: typeof receiver, value: typeof input) {
					trace.push('callback');
					return this.label + ': ' + value.suffix;
				}
			};
			const callback = Object.getOwnPropertyDescriptor(target, 'value')!.value as typeof target.value;
			this.state.label = Reflect.apply(
				callback,
				(trace.push('receiver'), receiver),
				[(trace.push('argument'), input)]
			);
		`,
		trace: ['receiver', 'argument', 'callback', 'receiver read', 'argument read'],
		browserOutput: 'from browser: from browser'
	},
	{
		name: 'Reflect.apply throws on a primitive argument vector before calling the target',
		body: `
			const descriptor = Object.getOwnPropertyDescriptor({ get value() { return document.title; } }, 'value');
			try {
				this.state.label = Reflect.apply(descriptor!.get!, undefined, null as unknown as []);
			} catch (error) {
				if (!(error instanceof TypeError)) throw error;
				this.state.label = 'rejected vector';
			}
		`,
		trace: [],
		output: 'rejected vector'
	},
	{
		name: 'a shadowed Reflect.apply leaves the descriptor callback dormant',
		body: `
			const Reflect = { apply: (() => 'shadowed') as typeof globalThis.Reflect.apply };
			const descriptor = Object.getOwnPropertyDescriptor({ get value() { return document.title; } }, 'value');
			this.state.label = Reflect.apply(descriptor!.get!, undefined, []);
		`,
		trace: [],
		output: 'shadowed'
	},
	{
		name: 'an authored Reflect.apply replacement leaves the descriptor callback dormant',
		body: `
			const operations = { apply: Reflect.apply };
			operations.apply = (() => 'replacement') as typeof Reflect.apply;
			const descriptor = Object.getOwnPropertyDescriptor({ get value() { return document.title; } }, 'value');
			this.state.label = operations.apply(descriptor!.get!, undefined, []);
		`,
		trace: [],
		output: 'replacement'
	},
	{
		name: 'stored descriptor getter via call',
		body: `
			const receiver = { label: 'from browser' };
			const descriptor = Object.getOwnPropertyDescriptor({
				get value() {
					trace.push(this === (receiver as object) ? 'getter:receiver' : 'getter:wrong receiver');
					return document.title;
				}
			}, 'value');
			this.state.label = descriptor!.get!.call(receiver);
		`,
		trace: ['getter:receiver']
	},
	{
		name: 'stored descriptor getter via Reflect.apply',
		body: `
			const receiver = { label: 'from browser' };
			const descriptor = Object.getOwnPropertyDescriptor({
				get value() {
					trace.push(this === (receiver as object) ? 'getter:receiver' : 'getter:wrong receiver');
					return document.title;
				}
			}, 'value');
			this.state.label = Reflect.apply(descriptor!.get!, receiver, []);
		`,
		trace: ['getter:receiver']
	},
	{
		name: 'dormant bound descriptor getter',
		body: `
			const descriptor = Object.getOwnPropertyDescriptor({
				get value() {
					trace.push('unexpected getter');
					return document.title;
				}
			}, 'value');
			const bound = descriptor!.get!.bind({});
			this.state.label = typeof bound;
		`,
		trace: [],
		output: 'function'
	},
	...(['Object.defineProperty', 'Reflect.defineProperty'] as const).flatMap((define) =>
		[
			{
				name: 'an inherited getter on the returned descriptor',
				target: '{ get code() { trace.push("original getter"); return 1; } }',
				inherited: true,
				read: 'Object.getOwnPropertyDescriptor(readTarget(), readKey())?.value'
			},
			{
				name: 'a dormant callable returned by the inherited getter',
				target: '{ get code() { trace.push("original getter"); return 1; } }',
				inherited: true,
				read: 'typeof Object.getOwnPropertyDescriptor(readTarget(), readKey())?.value',
				getter: '() => { trace.push("returned callback"); return document.title; }',
				output: 'function'
			},
			{
				name: 'an own data field on the returned descriptor',
				target: '{ code: "own" }',
				read: 'Object.getOwnPropertyDescriptor(target, "code")?.value',
				output: 'own'
			},
			{
				name: 'an absent descriptor',
				target: '{}',
				read: 'Object.getOwnPropertyDescriptor(target, "code")?.["value"] ?? "absent"',
				output: 'absent'
			}
		].map(({ name, target, read, getter, output, inherited }) => ({
			name: `${name} after ${define}`,
			body: `
				const target = ${target};
				${
					inherited
						? `
				function readTarget() { trace.push('target'); return target; }
				function readKey() { trace.push('key'); return 'code'; }
				`
						: ''
				}
				${define}(Object.prototype, 'value', {
					configurable: true,
					get() {
						trace.push(Object.hasOwn(this, 'get') ? 'descriptor receiver' : 'wrong receiver');
						return ${getter ?? 'document.title'};
					}
				});
				try {
					this.state.label = ${read};
				} finally {
					Reflect.deleteProperty(Object.prototype, 'value');
				}
			`,
			trace: inherited ? ['target', 'key', 'descriptor receiver'] : [],
			serverExecution: output !== undefined,
			output
		}))
	),
	{
		name: 'Proxy descriptor normalization',
		body: `
			const target = { value: 'target' };
			const handler = {
				getOwnPropertyDescriptor(actual: typeof target, key: PropertyKey) {
					trace.push(this === handler && actual === target && key === 'value'
						? 'trap:receiver and arguments' : 'trap:wrong receiver or arguments');
					const descriptor = {
						configurable: true,
						get value(): string {
							trace.push(this === descriptor ? 'descriptor:receiver' : 'descriptor:wrong receiver');
							return document.title;
						}
					};
					return descriptor;
				}
			};
			const proxy = new Proxy(target, handler);
			const descriptor = Object.getOwnPropertyDescriptor(proxy, 'value');
			this.state.label = typeof descriptor?.value === 'string' ? descriptor.value : 'missing';
		`,
		trace: ['trap:receiver and arguments', 'descriptor:receiver']
	}
];

const products = probes.flatMap((probe) =>
	(['application', 'library'] as const).map((packageType) => ({
		probe,
		packageType,
		name: probe.name
	}))
);

it.each(products)(
	'preserves authored task effects for $name in a $packageType',
	async ({ probe, packageType }) => {
		const root = await createBrowserTestWorkspace(
			'.exact-task-member-effects-',
			path.resolve('.tmp')
		);
		const entry = path.join(root, 'page.tsx');
		const compile = async (
			packageType: 'application' | 'library',
			placement: 'client' | 'server'
		) => {
			await writeFile(
				entry,
				`import { TaskContext, type Component } from '@exactjs/core';
export const trace: string[] = [];
declare function foreign(a: string, b: string): string;
export function Page(this: Component<{label: string}>) {
	this.state.label = 'initial';
	function show(task: TaskContext = TaskContext.${placement}()) {
		void task;
		trace.push('before');
		${probe.body}
		trace.push('after');
	}
	return () => <button onClick={() => show()}>{this.state.label}</button>;
}`
			);
			return compileProjectArtifacts([entry], {
				rootDir: root,
				outDir: path.join(root, packageType, placement),
				packageType,
				generatedValidation: 'semantic'
			});
		};

		const name = window.name;
		const title = document.title;
		const browserValue = 'from browser';
		onTestFinished(() => {
			window.name = name;
			document.title = title;
		});
		window.name = browserValue;
		document.title = browserValue;
		const [artifact] = await compile(packageType, 'client');
		const server = await importArtifact(
			artifact!.serverFile,
			path.join(root, `${packageType}-server.mjs`)
		);
		expect(server.trace).toEqual([]);
		const { html } = await renderToString(receipt(server.Page as AnyComponentFunction, {}), {
			markers: false
		});
		expect(html).toContain('>initial</button>');
		expect(server.trace).toEqual([]);

		const client = await importArtifact(
			artifact!.clientFile,
			path.join(root, `${packageType}-client.mjs`)
		);
		const host = document.createElement('div');
		onTestFinished(() => unmount(host));
		const errors: unknown[] = [];
		render(receipt(client.Page as AnyComponentFunction, {}), host, {
			onErrorReport: (report) => errors.push(report.error)
		});
		const button = host.querySelector('button')!;
		expect(button.textContent).toBe('initial');
		expect(client.trace).toEqual([]);
		button.click();
		await expect
			.poll(() => button.textContent)
			.toBe(probe.output ?? probe.browserOutput ?? browserValue);
		expect(client.trace).toEqual(['before', ...probe.trace, 'after']);
		expect(errors).toEqual([]);
		expect(server.trace).toEqual([]);

		if (probe.output === undefined) {
			await expect(compile(packageType, 'server')).rejects.toThrow(
				/EXACT2001.*browser-only globals/
			);
		} else if (probe.serverExecution) {
			const [remote] = await compile(packageType, 'server');
			const remoteServer = await importArtifact(
				remote!.serverFile,
				path.join(root, 'remote-server.mjs')
			);
			const remoteClient = await importArtifact(
				remote!.clientFile,
				path.join(root, 'remote-client.mjs')
			);
			const ServerPage = remoteServer.Page as AnyComponentFunction;
			const ClientPage = remoteClient.Page as AnyComponentFunction;
			const contract = composeExactExecutorContract([ServerPage], { endpoint: '/__exact' });
			const logger = {
				log: (event: { level: string }) => {
					if (event.level === 'warn' || event.level === 'error') errors.push(event);
				}
			};
			const rendered = await renderToHydratableString(receipt(ServerPage, {}), { logger });
			const remoteHost = document.createElement('div');
			remoteHost.innerHTML = rendered.htmlWithHydration;
			const remoteButton = remoteHost.querySelector('button')!;
			let requests = 0;
			const hydrated = hydrate(receipt(ClientPage, {}), remoteHost, {
				...composeExactComponentContracts([ClientPage], 'client'),
				resumptions: rendered.resumptions,
				endpoint: '/__exact',
				batch: false,
				onErrorReport: (report) => errors.push(report.error),
				onDiagnostic: (report) => errors.push(report),
				fetch: async (url, init) => {
					requests++;
					return exactResponseToFetchResponse(
						await handleExactRequest(
							{ method: init.method, url, headers: init.headers, body: init.body },
							{ contract, invocations: {}, logger }
						)
					);
				}
			});
			onTestFinished(() => hydrated.dispose());
			expect(remoteButton.textContent).toBe('initial');
			expect(remoteServer.trace).toEqual([]);
			expect(remoteClient.trace).toEqual([]);
			expect(requests).toBe(0);
			remoteButton.click();
			await expect.poll(() => remoteButton.textContent).toBe(probe.output);
			await hydrated.whenSettled();
			expect(requests).toBe(1);
			expect(remoteServer.trace).toEqual(['before', ...probe.trace, 'after']);
			expect(remoteClient.trace).toEqual([]);
			expect(Object.hasOwn(Object.prototype, 'value')).toBe(false);
			expect(errors).toEqual([]);
		} else {
			await expect(compile(packageType, 'server')).resolves.toHaveLength(1);
		}
	}
);
