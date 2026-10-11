/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished, vi } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

const cases = [
	{ name: 'ordinary', value: `['base',{active:props.active}]`, expected: 'base active' },
	{
		name: 'integer-key-order',
		value: `['base',{'2':props.active,'1':props.active}]`,
		expected: 'base 1 2'
	},
	{ name: 'prototype-setter', value: `['base',{'__proto__':props.active}]`, expected: 'base' },
	{
		name: 'computed-prototype-key',
		value: `['base',{['__proto__']:props.active}]`,
		expected: 'base __proto__'
	},
	{
		name: 'overwritten-key',
		value: `['base',{active:props.active,active:!props.active}]`,
		expected: 'base',
		inactive: 'base active'
	},
	{ name: 'object-spread', value: `['base',{...{active:props.active}}]`, expected: 'base active' },
	{ name: 'array-spread', value: `['base',...[{active:props.active}]]`, expected: 'base active' },
	{ name: 'empty-head', value: `['',{active:props.active}]`, expected: 'active' },
	{ name: 'empty-tail', value: `['base','',{active:props.active}]`, expected: 'base active' },
	{ name: 'computed-key', value: `['base',{['active']:props.active}]`, expected: 'base active' },
	{ name: 'empty-key', value: `['base',{'':props.active}]`, expected: 'base' },
	{
		name: 'noncanonical-integer',
		value: `['base',{'02':props.active,'1x':props.active}]`,
		expected: 'base 02 1x'
	},
	{
		name: 'nonboolean-truthy',
		value: `['base',{active:props.active?1:0}]`,
		expected: 'base active'
	},
	{ name: 'escaping-token', value: `['base',{'a"<b':props.active}]`, expected: 'base a"<b' }
] as const;

it.each(
	cases.flatMap((entry) => ['root', 'descendant'].map((placement) => ({ ...entry, placement })))
)(
	'preserves native class value semantics through SSR and strict hydration: $name ($placement)',
	async (entry) => {
		const { value, expected, placement } = entry;
		const root = await createTestWorkspace('.exact-class-values-', process.cwd());
		const files = await writeTestFiles(root, {
			'page.tsx': `import type {Component} from '@exactjs/core';export function Page(this:Component<{active:boolean}>,props:{active:boolean;extra?:{title?:string}}){this.state.active=props.active;return()=> ${placement === 'root' ? '' : '<main>'}<span {...props.extra} className={${value.replaceAll('props.active', 'this.state.active')}}><button onClick={()=>this.state.active=!this.state.active}>Toggle</button></span>${placement === 'root' ? '' : '</main>'};}`
		});
		const [artifact] = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		const host = document.createElement('div'),
			mounted = document.createElement('div'),
			errors: unknown[] = [];
		onTestFinished(() => {
			unmount(mounted);
			unmount(host);
		});
		render(receipt(client.Page as never, { active: true }), mounted, {
			onErrorReport: (r) => errors.push(r.error)
		});
		expect(mounted.querySelector('span')!.getAttribute('class')).toBe(expected);
		const output = await renderToHydratableString(receipt(server.Page as never, { active: true }));
		host.innerHTML = output.html;
		const original = host.querySelector('span')!;
		expect(original.getAttribute('class')).toBe(expected);
		const view = hydrate(receipt(client.Page as never, { active: true }), host, {
			...composeExactComponentContracts([client.Page as AnyComponentFunction], 'client'),
			resumptions: output.resumptions,
			onMismatch: 'throw',
			onErrorReport: (r) => errors.push(r.error)
		});
		onTestFinished(() => view.dispose());
		expect(host.querySelector('span')).toBe(original);
		expect(original.getAttribute('class')).toBe(expected);
		const inactive = 'inactive' in entry ? entry.inactive : value.startsWith("['',") ? '' : 'base';
		original.querySelector('button')!.click();
		await vi.waitFor(() => expect(original.getAttribute('class')).toBe(inactive));
		expect(host.querySelector('span')).toBe(original);
		original.querySelector('button')!.click();
		await vi.waitFor(() => expect(original.getAttribute('class')).toBe(expected));
		expect(host.querySelector('span')).toBe(original);
		expect(errors).toEqual([]);
	}
);
