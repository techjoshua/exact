import { expect, it, vi } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';
import { composeExactExecutorContract } from '@exactjs/server';
import { createExactServerHandlerRegistry, renderToString } from '@exactjs/ssr';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import type { AnyComponentFunction } from '@exactjs/core';

const forms = {
	same: { setup: '', first: 'props.url', input: 'props.url' },
	indexed: { setup: '', first: "props['url']", input: 'props.url' },
	alias: { setup: 'const url=props.url;', first: 'url', input: 'url' },
	different: { setup: '', first: 'props.label', input: 'props.url' },
	computed: { setup: "const key='url' as const;", first: 'props[key]', input: 'props[key]' },
	shadow: {
		setup: '',
		first: "(()=>{const props={url:'local'};return props.url;})()",
		input: 'props.url'
	}
};
for (const target of ['client', 'server'] as const)
	for (const [form, { setup, first, input }] of Object.entries(forms))
		it(`retains repeated ${form} captures across task callbacks and fetch (${target})`, async () => {
			const { compiled } = await privateHelperArtifact(
				`import {TaskContext,type Component} from '@exactjs/core';
export const cleaned:string[]=[];
export function Work(this:Component<{text:string}>,props:{url:string;label:string}){
 this.state.text='';${setup}
 async function load(task:TaskContext=TaskContext.server().blocking()){
  task.cleanup(()=>{cleaned.push(${first});});
  const response=await fetch(${input});this.state.text=await response.text();
 }load();return()=>this.state.text;
}`,
				target
			);
			expect(compiled.Work).toBeTypeOf('function');
			if (target !== 'server') return;
			const contract = composeExactExecutorContract([compiled.Work as AnyComponentFunction]);
			const id = Object.keys(contract.invocations)[0];
			const registry = createExactServerHandlerRegistry({ contract });
			const inputs: unknown[] = [];
			vi.stubGlobal('fetch', (input: unknown) => {
				inputs.push(input);
				return Promise.resolve(new Response('completed'));
			});
			try {
				const result = await registry.invocations[id](
					{
						type: 'invoke',
						id,
						state: { text: '' },
						payload: {
							dependencies:
								form === 'different'
									? ['label', 'https://example.invalid']
									: form === 'computed'
										? ['https://example.invalid', 'https://example.invalid']
										: ['https://example.invalid']
						}
					},
					{ contract }
				);
				expect(result.state).toEqual({ text: 'completed' });
				expect(inputs).toEqual(['https://example.invalid']);
				expect(compiled.cleaned).toEqual([
					form === 'different' ? 'label' : form === 'shadow' ? 'local' : 'https://example.invalid'
				]);
				inputs.length = 0;
				(compiled.cleaned as unknown[]).length = 0;
				const rendered = await renderToString(
					createCompiledComponentReceipt(compiled.Work as AnyComponentFunction, {
						url: 'https://example.invalid',
						label: 'label'
					}),
					{ maxTaskDurationMs: 500 }
				);
				expect(rendered.html).toContain('completed');
				expect(inputs).toEqual(['https://example.invalid']);
				expect(compiled.cleaned).toEqual([
					form === 'different' ? 'label' : form === 'shadow' ? 'local' : 'https://example.invalid'
				]);
			} finally {
				vi.unstubAllGlobals();
			}
		});
