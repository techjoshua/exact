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
	...(['direct', 'destructured', 'dormant'] as const).map((read) => ({
		name: `Reflect.apply keeps the prefix getter ${read} before a spread`,
		body: `
			const original = { get label() { trace.push('getter'); return document.title; } };
			const target = { value(${read === 'destructured' ? '{ label }: typeof original' : 'input: { label: string }'}, ...tail: string[]) {
				trace.push('callback');
				return ${read === 'direct' ? 'input.label' : read === 'destructured' ? 'label' : "'ready'"} + tail.join('');
			} };
			const callback = Object.getOwnPropertyDescriptor(target, 'value')!.value as typeof target.value;
			const tail = ['!'];
			this.state.label = Reflect.apply(callback, undefined, [
				(trace.push('prefix'), original),
				...(trace.push('spread'), tail)
			]);
		`,
		trace:
			read === 'destructured'
				? ['prefix', 'spread', 'getter', 'callback']
				: ['prefix', 'spread', 'callback', ...(read === 'direct' ? ['getter'] : [])],
		...(read === 'dormant' ? { output: 'ready!' } : { browserOutput: 'from browser!' })
	})),
	...(['Reflect.apply', 'apply'] as const).map((adapter) => ({
		name: `${adapter} skips later vector elements and target on a throwing spread`,
		body: `
			const input = { get label() { return document.title; } };
			const target = { value(input: { label: string }, ..._args: unknown[]) { trace.push(input.label); } };
			const callback = Object.getOwnPropertyDescriptor(target, 'value')!.value as typeof target.value;
			function fail(): string[] { trace.push('spread'); throw new Error('stop'); }
			try {
				${adapter === 'apply' ? 'callback.apply(undefined,' : 'Reflect.apply(callback, undefined,'}
					[(trace.push('prefix'), input), ...fail(), trace.push('unexpected tail')]);
			} catch (error) {
				if (!(error instanceof Error) || error.message !== 'stop') throw error;
				this.state.label = 'stopped';
			}
		`,
		trace: ['prefix', 'spread'],
		output: 'stopped'
	})),
	{
		name: 'Reflect.apply retains callback effects after an untrusted never annotation',
		body: `
			const input = { get label() { trace.push('getter'); return document.title; } };
			const target = { value(input: { label: string }, ..._args: string[]) {
				trace.push('callback');
				return input.label;
			} };
			const callback = Object.getOwnPropertyDescriptor(target, 'value')!.value as typeof target.value;
			function suffix(): never { trace.push('spread'); return [] as never; }
			this.state.label = Reflect.apply(callback, undefined, [input, ...(suffix() as string[])]);
		`,
		trace: ['spread', 'callback', 'getter'],
		browserOutput: 'from browser'
	},
	{
		name: 'Reflect.apply coerces an object length before reading any indexed arguments',
		body: `
			const target = { value(...args: unknown[]) {
				trace.push('callback:' + args.length);
				return 'ready';
			} };
			const callback = Object.getOwnPropertyDescriptor(target, 'value')!.value as typeof target.value;
			const length = {
				valueOf() {
					trace.push('valueOf:' + document.title);
					return 0;
				},
				toString() { trace.push('unexpected toString'); return '1'; }
			};
			const vector = {
				get length() { trace.push('length'); return length; },
				get 0() { trace.push('unexpected index'); return 'unused'; }
			};
			this.state.label = Reflect.apply(callback, undefined, vector as unknown as []);
		`,
		trace: ['length', 'valueOf:from browser', 'callback:0'],
		browserOutput: 'ready'
	},
	{
		name: 'Reflect.apply falls back to toString for an object returned by valueOf',
		body: `
			const target = { value(...args: unknown[]) { trace.push('callback:' + args.length); return 'ready'; } };
			const callback = Object.getOwnPropertyDescriptor(target, 'value')!.value as typeof target.value;
			const vector = { length: {
				valueOf() { trace.push('valueOf'); return this; },
				toString() { trace.push('toString:' + document.title); return '0'; }
			} };
			this.state.label = Reflect.apply(callback, undefined, vector as unknown as []);
		`,
		trace: ['valueOf', 'toString:from browser', 'callback:0'],
		browserOutput: 'ready'
	},
	{
		name: 'Reflect.apply passes the number hint to an exotic length hook',
		body: `
			const target = { value(...args: unknown[]) { trace.push('callback:' + args.length); return 'ready'; } };
			const callback = Object.getOwnPropertyDescriptor(target, 'value')!.value as typeof target.value;
			const vector = { length: {
				[Symbol.toPrimitive](hint: string) {
					trace.push(hint + ':' + document.title);
					return 0;
				},
				valueOf() { trace.push('unexpected valueOf'); return 1; }
			} };
			this.state.label = Reflect.apply(callback, undefined, vector as unknown as []);
		`,
		trace: ['number:from browser', 'callback:0'],
		browserOutput: 'ready'
	},
	...(['Reflect.apply', 'apply'] as const).flatMap((adapter) =>
		[
			{
				name: 'primitive valueOf skips toString',
				hooks: `valueOf() { trace.push('valueOf'); return 0; },
					toString() { return document.title; }`,
				trace: ['length', 'valueOf', 'callback:0'],
				output: 'ready'
			},
			{
				name: 'exotic hook skips valueOf',
				hooks: `[Symbol.toPrimitive](hint: string) { trace.push(hint); return 0; },
					valueOf() { return document.title; }`,
				trace: ['length', 'number', 'callback:0'],
				output: 'ready'
			},
			{
				name: 'exotic number hint skips a string-only branch',
				hooks: `[Symbol.toPrimitive](hint: string) {
					trace.push(hint);
					if (hint === 'string') return document.title;
					return 0;
				}`,
				trace: ['length', 'number', 'callback:0'],
				output: 'ready'
			},
			{
				name: 'exotic hint can reach an authored effect',
				hooks: `[Symbol.toPrimitive](hint: string) {
					trace.push(hint);
					if (hint === 'number') return document.title;
					return 0;
				}`,
				trace: ['length', 'number', 'callback:0'],
				browserOutput: 'ready'
			},
			{
				name: 'reassigned exotic hint retains possible effects',
				hooks: `[Symbol.toPrimitive](hint: string) {
					trace.push(hint);
					({ hint } = { hint: 'string' });
					if (hint === 'string') return document.title;
					return 0;
				}`,
				trace: ['length', 'number', 'callback:0'],
				browserOutput: 'ready'
			},
			{
				name: 'throwing valueOf skips toString',
				hooks: `valueOf() { trace.push('valueOf'); throw new Error('stop'); },
					toString() { return document.title; }`,
				trace: ['length', 'valueOf'],
				output: 'stopped'
			},
			{
				name: 'unresolved return retains possible toString effects',
				hooks: `valueOf() { return trace.length > 0 ? this : 0; },
					toString() { trace.push(document.title); return '0'; }`,
				trace: ['length', 'from browser', 'callback:0'],
				browserOutput: 'ready'
			}
		].map(({ name, hooks, ...expected }) => ({
			name: `${adapter} ${name}`,
			body: `
				const target = { value(...args: unknown[]) {
					trace.push('callback:' + args.length);
					return 'ready';
				} };
				const callback = Object.getOwnPropertyDescriptor(target, 'value')!.value as typeof target.value;
				const length = { ${hooks} };
				const vector = { get length() { trace.push('length'); return length; } };
				try {
					this.state.label = ${
						adapter === 'apply'
							? 'callback.apply(undefined, vector as unknown as [])'
							: 'Reflect.apply(callback, undefined, vector as unknown as [])'
					};
				} catch (error) {
					if (!(error instanceof Error) || error.message !== 'stop') throw error;
					this.state.label = 'stopped';
				}
			`,
			...expected
		}))
	),
	...(['Reflect.apply', 'apply'] as const).flatMap((adapter) =>
		[
			{ name: 'throwing valueOf skips indexed Gets', phase: 'index' },
			{ name: 'throwing valueOf skips callback entry', phase: 'callback' },
			{
				name: 'throwing exotic hook skips indexed Gets and callback entry',
				phase: 'both',
				exotic: true
			},
			{ name: 'throwing valueOf retains its reached effects', phase: 'hook' },
			{ name: 'normal length sibling keeps indexed Gets', phase: 'index', sibling: '1' },
			{
				name: 'unknown length sibling keeps callback entry',
				phase: 'callback',
				sibling: 'Number(trace.length - 1)'
			}
		].map(({ name, phase, exotic, sibling }) => ({
			name: `${adapter} ${name}`,
			body: `
				const target = { value(...args: unknown[]) {
					trace.push('callback:' + args.length${phase === 'callback' || phase === 'both' ? ' + document.title' : ''});
					return 'ready';
				} };
				const callback = Object.getOwnPropertyDescriptor(target, 'value')!.value as typeof target.value;
				const length = {
					${exotic ? '[Symbol.toPrimitive](hint: string)' : 'valueOf()'} {
						trace.push(${exotic ? 'hint' : "'valueOf'"}${phase === 'hook' ? ' + document.title' : ''});
						${exotic ? "if (hint !== 'number') return 1;" : ''}
						throw new Error('stop');
					}
				};
				const vector = {
					get length() {
						trace.push('length');
						return ${sibling ? `trace.length === 2 ? ${sibling} : length` : 'length'};
					},
					get 0() {
						trace.push('index'${phase === 'index' || phase === 'both' ? ' + document.title' : ''});
						return 'cell';
					}
				};
				try {
					this.state.label = ${
						adapter === 'apply'
							? 'callback.apply(undefined, vector as unknown as [])'
							: 'Reflect.apply(callback, undefined, vector as unknown as [])'
					};
				} catch (error) {
					if (!(error instanceof Error) || error.message !== 'stop') throw error;
					this.state.label = 'stopped';
				}
			`,
			trace: sibling
				? [
						'length',
						phase === 'index' ? 'indexfrom browser' : 'index',
						phase === 'callback' ? 'callback:1from browser' : 'callback:1'
					]
				: ['length', exotic ? 'number' : phase === 'hook' ? 'valueOffrom browser' : 'valueOf'],
			...(sibling
				? { browserOutput: 'ready' }
				: phase === 'hook'
					? { browserOutput: 'stopped' }
					: { output: 'stopped', serverExecution: true })
		}))
	),
	{
		name: 'Reflect.apply skips indexed reads at primitive zero length',
		body: `
			const target = { value(...args: unknown[]) { trace.push('callback:' + args.length); return 'ready'; } };
			const callback = Object.getOwnPropertyDescriptor(target, 'value')!.value as typeof target.value;
			const vector = { length: 0, get 0() { return document.title; } };
			this.state.label = Reflect.apply(callback, undefined, vector as unknown as []);
		`,
		trace: ['callback:0'],
		output: 'ready'
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
