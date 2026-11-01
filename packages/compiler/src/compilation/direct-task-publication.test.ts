import { createServer } from 'node:http';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { decodeReactiveProtocolValue, encodeReactiveProtocolValue } from '@exactjs/core';
import { composeExactExecutorContract } from '@exactjs/server';
import { createExactNodeHandler } from '@exactjs/node-adapter';
import { stateForContract } from '../../../hydrate/src/state.js';
import { stateWriteArtifact } from '../test-support/state-write-artifact.js';

const cases = [
	{
		name: 'changed assignment',
		body: "this.state.left.value='after';",
		state: { left: { value: 'after' } }
	},
	{
		name: 'equal assignment',
		body: "this.state.left.value='before';",
		state: { left: { value: 'before' } }
	},
	{ name: 'skipped assignment', body: "if(this.state.gate)this.state.left.value='after';" },
	{
		name: 'undefined assignment',
		body: 'this.state.left.value=undefined;',
		state: { left: { value: undefined } }
	},
	{ name: 'present deletion', body: 'delete this.state.left.value;', deletions: ['left.value'] },
	{ name: 'absent deletion', body: 'delete this.state.left.missing;', deletions: ['left.missing'] },
	{
		name: 'parent replacement retains old alias',
		body: "const old=this.state.left;this.state.left={value:'after',sibling:'new'};if(old.value!=='before')throw new Error('changed old alias');",
		state: { left: { value: 'after', sibling: 'new' } }
	}
];
const logicalCases = ['||=', '&&=', '??='].flatMap((operator) =>
	[false, true].map((writing) => {
		const initial =
			operator === '&&='
				? writing
					? 'before'
					: ''
				: writing
					? operator === '??='
						? undefined
						: ''
					: 'before';
		return {
			name: `logical ${operator} ${writing ? 'writing' : 'skipping'}`,
			initial,
			body: `this.state.left.value ${operator} 'after';`,
			...(writing ? { state: { left: { value: 'after' } } } : {}),
			callable: true
		};
	})
);

for (const example of [...cases, ...logicalCases])
	it(`publishes only performed task operations over HTTP: ${example.name}`, async () => {
		const compiled = await stateWriteArtifact(
			`import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{gate:boolean;left:{value?:string;missing?:string;sibling:string}}>){
 this.state.gate=false;this.state.left={value:'before',sibling:'server'};
 function save(task:TaskContext=TaskContext.server().blocking()){
  task.cleanup(()=>{void this.state.left.value;void this.state.left.missing;});
  ${example.body}
 }${'callable' in example ? 'return()=> <button onClick={()=>save()}>save</button>;' : 'save();return()=>this.state.left.value;'}
}`,
			'server'
		);
		const contract = composeExactExecutorContract([compiled.Page as AnyComponentFunction]);
		const [id] = Object.keys(contract.invocations);
		const operation = contract.invocations[id];
		const inputState = {
			gate: false,
			left: { value: 'initial' in example ? example.initial : 'before', sibling: 'server' }
		};
		const dependencies = operation.dependencies.map((dependency) => {
			expect(dependency.source).toBe('state');
			return dependency.path
				?.replace(/^this\.state\./, '')
				.split('.')
				.reduce<unknown>(
					(value, key) =>
						value && typeof value === 'object' ? Reflect.get(value, key) : undefined,
					inputState
				);
		});
		expect(Object.keys(contract.invocations)).toHaveLength(1);
		const reports: unknown[] = [];
		const server = createServer(
			createExactNodeHandler({
				contract,
				invocations: {},
				logger: {
					isEnabled: () => true,
					log: (report) => {
						reports.push(report);
					}
				}
			})
		);
		onTestFinished(async () => {
			server.closeAllConnections();
			if (server.listening)
				await new Promise<void>((resolve, reject) =>
					server.close((error) => (error ? reject(error) : resolve()))
				);
		});
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		const address = server.address();
		if (!address || typeof address === 'string') throw new Error('Missing HTTP listener address');
		const origin = `http://127.0.0.1:${address.port}`;
		for (const generation of [1, 2]) {
			const response = await fetch(origin + '/__exact', {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin },
				body: JSON.stringify(
					encodeReactiveProtocolValue({
						type: 'invoke',
						id,
						state: stateForContract(inputState, { reads: operation.stateReads }),
						payload: { dependencies, generation }
					})
				),
				signal: AbortSignal.timeout(5000)
			});
			const bytes = await response.text();
			expect(response.status, JSON.stringify({ bytes, reports, operation })).toBe(200);
			const result = decodeReactiveProtocolValue(JSON.parse(bytes)) as Record<string, unknown>;
			expect(result.ok).toBe(true);
			// Equal writes and absent deletes are executed operations. A skipped branch has no evidence.
			expect(result.state).toEqual(example.state);
			expect(result.deletions).toEqual('deletions' in example ? example.deletions : undefined);
			expect(result.mutations).toBeUndefined();
		}
		expect(reports).toEqual([]);
	});
