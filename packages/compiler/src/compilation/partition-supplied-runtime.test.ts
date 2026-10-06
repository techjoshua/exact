/** @vitest-environment jsdom */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction, Component } from '@exactjs/core';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it.each(['mount', 'hydrate'] as const)(
	'preserves supplied target ownership through a shared helper graph during %s',
	async (mode) => {
		const root = await createTestWorkspace('.exact-partition-supplied-', process.cwd());
		const entry = path.join(root, 'page.tsx');
		const helpers = Array.from(
			{ length: 28 },
			(_, index) =>
				`function p${index + 1}(inputs:Inputs){if(inputs.active)return p${index}(inputs);return p${index}(inputs);}`
		).join('');
		await writeFile(
			entry,
			`import {type Component} from '@exactjs/core';
import {createCompiledTargetReceipt} from '@exactjs/core/runtime/component-abi';
type Inputs={children?:unknown;label:string;active:boolean};
function p0(inputs:Inputs){return createCompiledTargetReceipt({title:inputs.label},inputs.children);}
${helpers}
export function Contribution(props:Inputs){return()=>p28(props);}
export let owner:Component<{count:number}>;
export function Page(this:Component<{count:number}>){owner=this;this.state.count=0;return()=> <main><button id="advance" onClick={()=>this.state.count++}>Next</button><Contribution label={'value '+this.state.count} active={this.state.count%2===0}><button id="owned">Child</button></Contribution></main>;}`
		);
		const [artifact] = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const client = await importArtifact(artifact.clientFile, path.join(root, 'client.mjs'));
		const server = await importArtifact(artifact.serverFile, path.join(root, 'server.mjs'));
		const host = document.createElement('div');
		onTestFinished(() => {
			unmount(host);
		});
		let original: Element | null = null;
		if (mode === 'hydrate') {
			const output = await renderToHydratableString(
				receipt(server.Page as AnyComponentFunction, {})
			);
			host.innerHTML = output.html;
			original = host.querySelector('#owned');
			expect(original?.getAttribute('title')).toBe('value 0');
			hydrate(receipt(client.Page as AnyComponentFunction, {}), host, {
				...composeExactComponentContracts(
					[client.Page as AnyComponentFunction, client.Contribution as AnyComponentFunction],
					'client'
				),
				resumptions: output.resumptions,
				onMismatch: 'throw'
			});
		} else render(receipt(client.Page as AnyComponentFunction, {}), host);
		const owned = host.querySelector('#owned');
		const advance = host.querySelector<HTMLButtonElement>('#advance')!;
		expect(owned?.getAttribute('title')).toBe('value 0');
		if (original) expect(owned).toBe(original);
		for (const count of [1, 2]) {
			advance.click();
			await expect.poll(() => owned?.getAttribute('title')).toBe('value ' + count);
			expect(host.querySelector('#owned')).toBe(owned);
		}
		const owner = client.owner as Component<{ count: number }>;
		unmount(host);
		advance.click();
		expect(owner.state.count).toBe(2);
	}
);
