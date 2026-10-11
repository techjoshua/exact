/** @vitest-environment jsdom */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

async function artifact(source: string, target: 'client' | 'server') {
	const parent = path.resolve('.tmp/core-import-identity');
	await mkdir(parent, { recursive: true });
	const root = await createTestWorkspace('probe-', parent);
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const file = path.join(root, 'probe.tsx');
	const response = compiler.request({
		kind: 'compile',
		id: file,
		root: process.cwd(),
		target,
		source,
		diagnostics: 'semantic'
	});
	expect(response.diagnostics).toEqual([]);
	const runtime =
		target === 'server'
			? `import {renderToString} from '@exactjs/ssr';export const html=async()=> (await renderToString(probe,{markers:false})).html;`
			: `import {render,unmount} from '@exactjs/dom';import {flushSync} from '@exactjs/reactive/framework/runtime';export const mount=(root,options)=>render(probe,root,options);export {unmount,flushSync};`;
	await writeFile(file, response.code + '\n' + runtime);
	return importArtifact(file, path.join(root, 'probe.mjs'));
}

const structural = [
	'Activity',
	'Cell',
	'Dynamic',
	'Fragment',
	'Portal',
	'Suspense',
	'Target',
	'Text',
	'UnsafeHtml'
];
for (const target of ['client', 'server'] as const)
	it.each(structural)(
		`preserves a local component alias shadowing core %s (${target})`,
		async (name) => {
			const module = await artifact(
				`import {${name},type Component} from '@exactjs/core';void ${name};export let clicks=0;
function Leaf(this:Component<{count:number}>){this.state.count=0;return()=> <button data-leaf onClick={()=>{this.state.count++;clicks++;}}>local {this.state.count}</button>;}
export function Page(){const ${name}=Leaf;return()=> <${name}/>;}export const probe=<Page/>;`,
				target
			);
			if (target === 'server') {
				expect(await (module.html as () => Promise<string>)()).toContain('local 0');
				return;
			}
			const container = document.createElement('main');
			const errors: unknown[] = [];
			const mount = module.mount as (root: Element, options: Record<string, unknown>) => void;
			const unmount = module.unmount as (root: Element) => void;
			onTestFinished(() => unmount(container));
			mount(container, { onErrorReport: (error: unknown) => errors.push(error) });
			const button = container.querySelector('button')!;
			expect(button?.textContent).toBe('local 0');
			button.click();
			(module.flushSync as () => void)();
			expect(container.querySelector('button')).toBe(button);
			expect(button.textContent).toBe('local 1');
			expect(module.clicks).toBe(1);
			unmount(container);
			button.click();
			expect(module.clicks).toBe(1);
			expect(errors).toEqual([]);
		}
	);

it.each(['client', 'server'] as const)(
	'preserves an ordinary same-named registry factory invocation (%s)',
	async (target) => {
		const module = await artifact(
			`let calls=0;function createComponentRegistry(define:()=>unknown){calls++;return define();}function Leaf(){return()=> <p>leaf</p>;}const Views=createComponentRegistry(()=>({row:Leaf}));export const count=calls;export function Page(){return()=> <p>page</p>;}export const probe=<Page/>;`,
			target
		);
		expect(module.count).toBe(1);
	}
);
