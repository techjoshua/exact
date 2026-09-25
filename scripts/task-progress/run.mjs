import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { compileFileArtifacts } from '@exactjs/compiler';
import { checkNativeProgress } from './native-scenarios.mjs';

const root = path.resolve(import.meta.dirname, '../..');
await mkdir(path.join(root, '.tmp'), { recursive: true });
const temporary = await mkdtemp(path.join(root, '.tmp/progress-edge-'));
const pending = new Map();
const released = new Set();
const control = createServer((request, response) => {
	const url = new URL(request.url, 'http://localhost');
	const id = url.searchParams.get('id');
	if (url.pathname === '/status') {
		response.end(JSON.stringify({ pending: [...pending.keys()] }));
		return;
	}
	if (url.pathname === '/release') {
		released.add(id);
		pending.get(id)?.end('released');
		pending.delete(id);
		response.end('ok');
		return;
	}
	if (url.pathname === '/gate') {
		if (released.has(id)) {
			response.end('released');
			return;
		}
		pending.set(id, response);
		// Repeated source updates exercise host disconnect detection on the next write.
		const tick = setInterval(() => response.write('tick'), 100);
		response.on('close', () => clearInterval(tick));
		response.on('close', () => {
			pending.delete(id);
		});
		return;
	}
	response.writeHead(404).end();
});
let worker;
try {
	await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
	const controlOrigin = 'http://127.0.0.1:' + control.address().port;
	const source = path.join(temporary, 'Page.tsx');
	await writeFile(
		source,
		`import {TaskContext,type Component} from '@exactjs/core';
let runs=0; const cleaned=[];
export function runCount() {return {runs,cleaned};}
export function NativeProgress(this: Component<{completed:number}>) {
 this.state.completed=0;
 const report=(snapshot:{completed:number;id:number},_task:TaskContext=TaskContext.client().progress())=>{
  this.state.completed=snapshot.completed;
 };
 const job=async(id:number,mode:string,task:TaskContext=TaskContext.server())=>{
  runs++; task.cleanup(()=>{cleaned.push({id,aborted:task.signal.aborted});});
  report({completed:42,id});
  const response=await fetch(${JSON.stringify(controlOrigin)}+'/gate?id='+id,{signal:task.signal});
  const reader=response.body.getReader();
  try {while(!(await reader.read()).done) report({completed:42,id});}
  finally {reader.releaseLock();}
  if(mode==='fail') throw new Error('expected native task failure');
  return id;
 };
 return ()=><button onClick={()=>job(0,'normal')}>{this.state.completed}</button>;
}`
	);
	const artifacts = await compileFileArtifacts(source, {
		rootDir: temporary,
		outDir: path.join(temporary, 'compiled')
	});
	for (const runtime of ['deno', 'cloudflare']) {
		pending.clear();
		released.clear();
		const entry = path.join(temporary, runtime + '.ts');
		await writeFile(
			entry,
			`import {NativeProgress,runCount} from ${JSON.stringify(artifacts.serverFile)};
import {composeExactExecutorContract,createExactContextRuntime} from '@exactjs/server';
import {${runtime === 'deno' ? 'createExactDenoHandler' : 'createExactCloudflareHandler'} as createHandler} from '@exactjs/${runtime}-adapter';
const contract=composeExactExecutorContract([NativeProgress],{endpoint:'/__exact'});
const operation=Object.values(contract.invocations).find(value=>value.progress?.length);
if(!operation) throw new Error('Missing compiled progress receiver');
const warnings=[];
const logger={log(event){if(event.level==='warn') warnings.push(event.message);}};
const handler=createHandler({contract,logger});
const buffered=createHandler({contract:{...contract,endpoint:'/buffered'},logger,contextRuntime:createExactContextRuntime(),progress:{supported:false,reason:'test deployment buffers responses'}});
const app={fetch(request,env,ctx){
 const pathname=new URL(request.url).pathname;
 if(pathname==='/contract') return Response.json({id:operation.id});
 if(pathname==='/runs') return Response.json(runCount());
 if(pathname==='/warnings') return Response.json(warnings);
 return (pathname==='/buffered'?buffered:handler)(request,env,ctx);
}};
${
	runtime === 'deno'
		? `import {checkNativeProgress} from ${JSON.stringify(path.join(root, 'scripts/task-progress/native-scenarios.mjs'))};
const server=Deno.serve({hostname:'127.0.0.1',port:0,onListen(){}},request=>app.fetch(request));
try {await checkNativeProgress('http://127.0.0.1:'+server.addr.port,${JSON.stringify(controlOrigin)});console.log('Deno native progress passed');}
finally {await server.shutdown();await server.finished;}`
		: 'export default app;'
}`
		);
		const output = path.join(temporary, runtime + '.mjs');
		await build({
			entryPoints: [entry],
			outfile: output,
			bundle: true,
			platform: 'neutral',
			format: 'esm',
			conditions: ['worker'],
			mainFields: ['module', 'main'],
			external: ['node:assert/strict'],
			target: 'es2022'
		});
		if (runtime === 'deno') {
			// Resolve the pinned npm-distributed executable through its own installer, just as its CLI does.
			const deno = createRequire(import.meta.url)('deno/install_api.cjs').runInstall();
			for (const flags of [[], ['--unstable-no-legacy-abort']]) {
				pending.clear();
				released.clear();
				const result = await promisify(execFile)(
					deno,
					[
						'run',
						'--no-config',
						'--no-lock',
						'--cached-only',
						...flags,
						'--allow-net=127.0.0.1',
						output
					],
					{ cwd: temporary, timeout: 30000, maxBuffer: 1024 * 1024 }
				);
				process.stdout.write(
					result.stdout.trimEnd() + (flags.length ? ' (modern abort)\n' : ' (default abort)\n')
				);
			}
		} else {
			worker = new Miniflare(
				convertV4MiniflareOptions({
					modules: true,
					unsafeDirectSockets: [{ host: '127.0.0.1', port: 0 }],
					scriptPath: output,
					compatibilityDate: '2026-07-30',
					compatibilityFlags: ['enable_request_signal'],
					host: '127.0.0.1',
					port: 0
				})
			);
			await checkNativeProgress(await worker.unsafeGetDirectURL(), controlOrigin);
			console.log('Cloudflare workerd native progress passed');
			await worker.dispose();
			worker = undefined;
		}
	}
} finally {
	for (const response of pending.values()) response.destroy();
	control.closeAllConnections();
	await worker?.dispose();
	await new Promise((resolve) => control.close(resolve));
	await rm(temporary, { recursive: true, force: true });
}
