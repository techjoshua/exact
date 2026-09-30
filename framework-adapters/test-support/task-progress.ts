import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Creates a shared adapter fixture which cannot finish until its progress crosses real HTTP. */
export async function createTaskProgressFixture(runtime: 'node' | 'bun' = 'node') {
	const workspace = fileURLToPath(new URL('../../', import.meta.url));
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/progress-adapter-'));
	const dispose = () => rm(root, { recursive: true, force: true });
	try {
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({ name: 'progress-adapter-fixture', private: true, type: 'module' })
		);
		await writeFile(path.join(root, 'exact.config.mjs'), 'export default {};');
		await writeFile(
			path.join(root, 'Progress.tsx'),
			`import { createComponentRegistry, TaskContext, type Component } from '@exactjs/core';
export const Views=createComponentRegistry(({lazy})=>({
 progress:Progress, deferred:lazy(()=>import('./Progress.js').then(module=>module.Progress))
}));
let finish: (() => void) | undefined;
export function finishJob() { finish?.(); }
function waitForFinish() { return new Promise<void>(resolve => { finish = resolve; }); }
export function Progress(this: Component<{ completed: number; profile: {owner:string} }>, props:{owner:string}) {
 this.state.completed = 0; this.state.profile={owner:'initial'};
 async function report(snapshot: number, task: TaskContext = TaskContext.client().progress()) {
  await Promise.resolve(); this.state.completed = snapshot;
 }
 async function start(task: TaskContext = TaskContext.server()) {
  this.state.profile.owner=props.owner; this.state.completed++;
  const completion = waitForFinish(); report(42); await completion; return 100 + this.state.completed;
 }
 return () => <button onClick={() => start()}>{this.state.completed}</button>;
}`
		);
		await writeFile(
			path.join(root, 'run.ts'),
			`import { Progress, Views, finishJob } from './Progress.js';
import {exactComponentIdentity} from '@exactjs/core/framework/component-contracts';
import { composeExactExecutorContract } from '@exactjs/server';
import '@exactjs/ssr/runtime/structural-boundaries';
import { renderToHydratableString } from '@exactjs/ssr';
import { createServerBoundaryReceipt, createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
${runtime === 'bun' ? "import { createExactBunHandler } from '@exactjs/bun-adapter';" : "import { createExactNodeHandler } from '@exactjs/node-adapter'; import { createServer } from 'node:http';"}
for (const Selected of [Views.progress, Views.deferred]) {
const island = await renderToHydratableString(createServerBoundaryReceipt('adapter-island', 'AdapterIsland', {
 __exactHydration:'eager', __exactHydrationFallback:createCompiledComponentReceipt(Selected,{owner:'adapter-owner'})
}));
const encoded = island.html.match(/data-exact-client-props="([^"]*)"/);
if (!encoded) throw new Error('Missing parent island payload');
const payload=JSON.parse(encoded[1].replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&'));
if (payload.resumptions?.length!==1 || island.html.includes('data-exact-client-name="Progress"')) throw new Error('Nested resumptions escaped their parent island');
if (payload.resumptions[0][0]!==exactComponentIdentity(Progress)) throw new Error('Registry lost selected activation identity');
}
const contract = composeExactExecutorContract([Progress], {endpoint:'/__exact'});
const operation = Object.values(contract.invocations).find(value => value.progress?.length);
if (!operation) throw new Error('Missing compiled progress operation');
${
	runtime === 'bun'
		? `const server = Bun.serve({hostname:'127.0.0.1',port:0,fetch:createExactBunHandler({contract})});
const address = {port:server.port};
const stop = async () => { await server.stop(true); };`
		: `const server = createServer(createExactNodeHandler({contract}));
await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
const stop = async () => { server.closeAllConnections(); await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); };`
}
try {
 if (!address || typeof address === 'string') throw new Error('Missing address');
 const response = await fetch('http://127.0.0.1:' + address.port + '/__exact', {
  method:'POST', signal: AbortSignal.timeout(5000),
  headers:{'content-type':'application/json',accept:'application/x-ndjson','x-exact-progress':'1'},
  body:JSON.stringify({type:'invoke',id:operation.id,state:{completed:0},payload:{dependencies:['adapter-owner']}})
 });
 if (!response.ok || !response.body) throw new Error('Invocation failed '+response.status);
 const reader=response.body.getReader(); const decoder=new TextDecoder(); let buffer=''; let progressed=false; let completed=false; let nested=false;
 while (true) {
  const next=await reader.read(); if(next.done) break; buffer+=decoder.decode(next.value,{stream:true});
  let end; while((end=buffer.indexOf('\\n'))>=0) {
   const event=JSON.parse(buffer.slice(0,end)); buffer=buffer.slice(end+1);
   if(event.event==='progress') { if(event.snapshot!==42 || completed) throw new Error('Invalid progress'); progressed=true; finishJob(); }
   if(event.event==='state') { if(event.value?.profile?.owner!=='adapter-owner') throw new Error('Invalid captured owner'); nested=true; }
   if(event.event==='result') { if(!progressed || !event.result.ok || event.result.value!==101 || !nested) throw new Error('Invalid terminal result '+JSON.stringify(event)); completed=true; }
  }
 }
 if(!progressed || !completed) throw new Error('Progress did not arrive before completion');
 console.log(JSON.stringify({progress:true,completed:true}));
} finally {
 finishJob(); await stop();
}`
		);
		return { root, workspace, dispose };
	} catch (error) {
		await dispose();
		throw error;
	}
}
