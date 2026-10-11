import path from 'node:path';
import { expect, it } from 'vitest';
import { analyzeSource } from './compilation/source-analysis.js';
import { transform } from './index.js';
import { createTestWorkspace, writeTestFiles } from './test-support/workspace.js';

it('preserves direct, aliased and readonly finite registry keys while rejecting unproven keys', async () => {
	const root = await createTestWorkspace('.exact-policy-key-types-', path.resolve('.tmp'));
	await writeTestFiles(root, {
		'widgets.tsx': `import {createComponentRegistry} from '@exactjs/core';
		 function Grid(){return()=> <p>grid</p>;}
		 export const Widget=createComponentRegistry(()=>({grid:Grid}));`,
		'contracts.ts': `import type {KeyOf} from '@exactjs/core';import {Widget} from './widgets.js';
		 export type Key=KeyOf<typeof Widget>;export interface Inputs{key:Key;}`
	});
	for (const target of [undefined, 'client', 'server'] as const) {
		for (const type of ['{key:KeyOf<typeof Widget>}', '{key:Key}', 'Inputs', 'Readonly<Inputs>']) {
			const source = `import type{KeyOf}from '@exactjs/core';import {Widget} from './widgets.js';
			import type{Key,Inputs}from './contracts.js';
			export function Panel(props:${type}){const Selected=Widget[props.key];return()=> <Selected/>;}`;
			expect(
				() =>
					transform(source, {
						filename: path.join(root, 'panel.tsx'),
						target,
						generatedValidation: 'semantic'
					}),
				type
			).not.toThrow();
		}
		for (const type of ['string', `Key|'missing'`]) {
			const source = `import {Widget} from './widgets.js';import type{Key}from './contracts.js';
			export function Panel(props:{key:${type}}){const Selected=Widget[props.key];return()=> <Selected/>;}`;
			expect(
				() =>
					transform(source, {
						filename: path.join(root, 'panel.tsx'),
						target,
						generatedValidation: 'semantic'
					}),
				type
			).toThrow(/TS7053|must be proven by KeyOf/);
		}
	}
});

it('preserves imported residency annotations through aliases and readonly views', async () => {
	const root = await createTestWorkspace('.exact-policy-residency-types-', path.resolve('.tmp'));
	await writeTestFiles(root, {
		'contracts.d.ts': `export interface InternalState{
		 /** @exact keep=server */ internal:string;
		 label:string;}
		 export type Alias=InternalState;`
	});
	for (const target of [undefined, 'client', 'server'] as const)
		for (const type of ['InternalState', 'Alias', 'Readonly<Alias>']) {
			const source = (field: string) => `import{TaskContext,type Component}from '@exactjs/core';
			import type{InternalState,Alias}from './contracts.js';
			export function Panel(this:Component<${type}>){
			 const inspect=(_task:TaskContext=TaskContext.client())=>void this.state.${field};
			 return()=> <button onClick={()=>inspect()}>Ready</button>;}`;
			const rejected = analyzeSource(source('internal'), {
				filename: path.join(root, 'panel.tsx'),
				target
			});
			expect(rejected.diagnostics).toContainEqual(
				expect.stringContaining('client task reads or writes server-kept data')
			);
			const accepted = analyzeSource(source('label'), {
				filename: path.join(root, 'panel.tsx'),
				target
			});
			expect(accepted.diagnostics.filter((diagnostic) => diagnostic.startsWith('error:'))).toEqual(
				[]
			);
			expect(accepted.components[0].tasks[0].placement).toBe('client');
		}
});

it('keeps finite named remote writes distinct from diagnosed computed authority through type aliases', () => {
	for (const target of [undefined, 'client', 'server'] as const)
		for (const key of [`'left'|'right'`, 'Field']) {
			const source = (write: string) => `import{TaskContext,type Component}from '@exactjs/core';
			type Field='left'|'right';type State={left:number;right:number};
			export function Panel(this:Component<State>,props:Readonly<{key:${key}}>){
			 const run=(_task:TaskContext=TaskContext.server())=>{${write}};
			 return()=> <button onClick={()=>run()}>{this.state.left}:{this.state.right}</button>;}`;
			const rejected = analyzeSource(source('this.state[props.key]++;'), {
				filename: path.resolve('.tmp/policy-authority-types.tsx'),
				target
			});
			expect(rejected.diagnostics).toContainEqual(
				expect.stringContaining('dynamic computed path or opaque helper')
			);
			const accepted = analyzeSource(
				source(`if(props.key==='left')this.state.left++;else this.state.right++;`),
				{ filename: path.resolve('.tmp/policy-authority-types.tsx'), target }
			);
			expect(accepted.diagnostics.filter((diagnostic) => diagnostic.startsWith('error:'))).toEqual(
				[]
			);
			expect(
				accepted.continuations[0].effects.stateWrites.map((write) => write.path).sort()
			).toEqual(['left', 'right']);
		}
});
