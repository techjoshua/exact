import path from 'node:path';
import { expect, it } from 'vitest';
import { analyzeSource } from './compilation/source-analysis.js';

const imports = `import {TaskContext,type Component} from '@exactjs/core';
import {consume,type Secret} from '@exactjs/secrets';
declare function readCredential():Secret<string>;`;

for (const target of [undefined, 'client', 'server'] as const) {
	it(`audits secret consumption at function-task execution placement (${target ?? 'default'})`, () => {
		for (const declaration of [
			`const load=(_task:TaskContext=TaskContext.server())=>{void consume(readCredential());this.state.label='Public';};`,
			`function load(_task:TaskContext=TaskContext.server()){void consume(readCredential());this.state.label='Public';}`,
			`const load=async(_task:TaskContext=TaskContext.server())=>{await Promise.resolve();void consume(readCredential());this.state.label='Public';};const selected=load;`
		]) {
			const name = declaration.includes('const selected') ? 'selected' : 'load';
			const analysis = analyzeSource(
				`${imports}export function Page(this:Component<{label:string}>){${declaration}return()=> <button onClick={()=>${name}()}>{this.state.label}</button>;}`,
				{ filename: path.resolve('.tmp/policy-task-consumption.tsx'), target }
			);
			expect(analysis.diagnostics.filter((message) => message.startsWith('error:'))).toEqual([]);
			expect(analysis.policy.secretConsumers).toContainEqual(
				expect.objectContaining({ target: 'server', authorization: 'implicit-application-owner' })
			);
		}
	});
}

it('continues rejecting secret consumption in code retained by the client artifact', () => {
	for (const definition of [
		`const load=(_task:TaskContext=TaskContext.client())=>void consume(readCredential());`,
		`const load=()=>void consume(readCredential());`,
		`const load=(_task:TaskContext=TaskContext.server(),value=consume(readCredential()))=>void value;`,
		`const load=(_task:TaskContext=TaskContext.server())=>{const nested=(_child:TaskContext=TaskContext.client())=>void consume(readCredential());nested();};`,
		`function helper(){return consume(readCredential());}const load=(_task:TaskContext=TaskContext.server())=>void helper();`
	]) {
		const analysis = analyzeSource(
			`${imports}export function Page(){${definition}return()=> <button onClick={()=>load()}>Load</button>;}`,
			{ filename: path.resolve('.tmp/policy-client-consumption.tsx'), target: 'client' }
		);
		expect(analysis.diagnostics).toContainEqual(
			expect.stringContaining('secret consumption cannot be retained in a client artifact')
		);
	}
});

it('does not treat a secret result as a public task invocation capability', () => {
	for (const target of [undefined, 'client', 'server'] as const) {
		const analysis = analyzeSource(
			`${imports}export function Page(){const load=(_task:TaskContext=TaskContext.server())=>readCredential();return()=> <button title={load()}>Load</button>;}`,
			{ filename: path.resolve('.tmp/policy-secret-task-result.tsx'), target }
		);
		expect(analysis.diagnostics).toContainEqual(
			expect.stringContaining('secret-qualified value cannot influence an operation attribute')
		);
	}
});

for (const target of [undefined, 'client', 'server'] as const) {
	it(`rejects client task access to local and callable secret facts (${target ?? 'default'})`, () => {
		for (const body of [
			'void readCredential();',
			'void consume(readCredential());',
			'const credential=readCredential();void credential;'
		]) {
			const analysis = analyzeSource(
				`${imports}export function Page(){const load=(_task:TaskContext=TaskContext.client())=>{${body}};return()=> <button onClick={()=>load()}>Load</button>;}`,
				{ filename: path.resolve('.tmp/policy-task-local-reads.tsx'), target }
			);
			expect(analysis.diagnostics, body).toContainEqual(
				expect.stringContaining('client task reads or writes server-kept data')
			);
		}
	});
}

for (const target of [undefined, 'client', 'server'] as const) {
	it(`infers server task placement from a qualified local binding (${target ?? 'default'})`, () => {
		const analysis = analyzeSource(
			`${imports}declare const credential:Secret<string>;export function Page(this:Component<{label:string}>){const load=(_task:TaskContext=TaskContext.blocking())=>{void credential;this.state.label='Public';};return()=> <button onClick={()=>load()}>{this.state.label}</button>;}`,
			{ filename: path.resolve('.tmp/policy-task-inferred-placement.tsx'), target }
		);
		expect(analysis.diagnostics.filter((message) => message.startsWith('error:'))).toEqual([]);
		expect(analysis.components[0].tasks.map((task) => task.placement)).toEqual(['server']);
	});
}
