/** @vitest-environment jsdom */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { renderToString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createBrowserTestWorkspace } from '../test-support/workspace.js';

const probes: {
	name: string;
	body: string;
	trace: string[];
	output?: string;
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
		await expect.poll(() => button.textContent).toBe(probe.output ?? browserValue);
		expect(client.trace).toEqual(['before', ...probe.trace, 'after']);
		expect(errors).toEqual([]);
		expect(server.trace).toEqual([]);

		if (probe.output === undefined) {
			await expect(compile(packageType, 'server')).rejects.toThrow(
				/EXACT2001.*browser-only globals/
			);
		} else {
			await expect(compile(packageType, 'server')).resolves.toHaveLength(1);
		}
	}
);
