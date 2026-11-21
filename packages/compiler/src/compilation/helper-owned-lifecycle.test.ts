import { createServer } from 'node:http';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { decodeReactiveProtocolValue, encodeReactiveProtocolValue } from '@exactjs/core';
import { composeExactExecutorContract } from '@exactjs/server';
import { createExactNodeHandler } from '@exactjs/node-adapter';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { stateForContract } from '../../../hydrate/src/state.js';

it('isolates overlapping helper owners and fences cancelled HTTP work after suspension', async () => {
	const root = await createCompilerTestWorkspace('.exact-helper-lifecycle-', process.cwd());
	const files = await writeTestFiles(root, {
		'helper.ts': `export const gates=new Map<string,()=>void>();let commits='';export function committed(){return commits;}function wait(label:string){return new Promise<void>(resolve=>gates.set(label,resolve));}
 export async function apply(state:{request:string;left:{value:string}}){const label=state.request;await wait(label);state.left.value=label;commits+=label;return state.left;}`,
		'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';import {apply} from './helper.js';export {gates,committed} from './helper.js';export const cleaned:string[]=[];
 export function Page(this:Component<{request:string;left:{value:string}}>){this.state.request='';this.state.left={value:'before'};
 async function save(task:TaskContext=TaskContext.server().parallel()){task.cleanup(()=>{void this.state.left.value;cleaned.push(this.state.request);});const result=await apply(this.state);return result.value;}
 return()=> <button onClick={()=>save()}>save</button>;}`
	});
	const artifacts = await compileProjectArtifacts([files['page.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const page = artifacts.find((artifact) => artifact.inputFile === files['page.tsx'])!;
	const module = await importArtifact(page.serverFile, path.join(root, 'server.mjs'));
	const gates = module.gates as Map<string, () => void>,
		cleaned = module.cleaned as string[],
		committed = module.committed as () => string;
	const contract = composeExactExecutorContract([module.Page as AnyComponentFunction]);
	const [operation] = Object.values(contract.invocations);
	expect(Object.keys(contract.invocations)).toHaveLength(1);
	expect(operation!.dependencies).toEqual([]);
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
		for (const release of gates.values()) release();
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
	if (!address || typeof address === 'string') throw new Error('No listener');
	const origin = `http://127.0.0.1:${address.port}`;
	let generation = 0;
	const send = async (label: string, signal?: AbortSignal) => {
		const response = await fetch(origin + '/__exact', {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin },
			body: JSON.stringify(
				encodeReactiveProtocolValue({
					type: 'invoke',
					id: operation!.id,
					state: stateForContract(
						{ request: label, left: { value: 'before' } },
						{ reads: operation!.stateReads }
					),
					payload: { dependencies: [], generation: ++generation }
				})
			),
			signal: signal
				? AbortSignal.any([signal, AbortSignal.timeout(10000)])
				: AbortSignal.timeout(10000)
		});
		const bytes = await response.text();
		expect(response.status, JSON.stringify({ bytes, reports })).toBe(200);
		return decodeReactiveProtocolValue(JSON.parse(bytes)) as Record<string, unknown>;
	};
	const first = send('A'),
		second = send('B');
	await expect.poll(() => gates.size).toBe(2);
	gates.get('B')!();
	expect(await second).toMatchObject({ ok: true, value: 'B', state: { left: { value: 'B' } } });
	expect(committed()).toBe('B');
	gates.get('A')!();
	expect(await first).toMatchObject({ ok: true, value: 'A', state: { left: { value: 'A' } } });
	expect(committed()).toBe('BA');
	const controller = new AbortController();
	const cancelled = send('C', controller.signal).catch((error) => error);
	await expect.poll(() => gates.has('C')).toBe(true);
	controller.abort();
	expect(await cancelled).toMatchObject({ name: 'AbortError' });
	await expect.poll(() => cleaned.includes('C')).toBe(true);
	gates.get('C')!();
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(committed()).toBe('BA');
	const following = send('F');
	await expect.poll(() => gates.has('F')).toBe(true);
	gates.get('F')!();
	expect(await following).toMatchObject({ ok: true, value: 'F', state: { left: { value: 'F' } } });
	expect(committed()).toBe('BAF');
	expect(cleaned.sort()).toEqual(['A', 'B', 'C', 'F']);
	expect(reports).toEqual([]);
});
