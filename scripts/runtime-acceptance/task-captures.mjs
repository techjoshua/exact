import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { compileProjectArtifacts } from '@exactjs/compiler';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { verifyStatePublicationJourney } from '../../packages/component-composition-corpus/test-support/state-publication-journey.mjs';
import { request, json } from './test-support.mjs';

/** Builds the owned capture fixture for native SSR and each host's request adapter. */
export async function prepareTaskCaptures(root, temporary) {
	let source = (
		await readFile(
			path.join(
				root,
				'packages/component-composition-corpus/src/test-support/task-activation-captures.fixtures.tsx'
			),
			'utf8'
		)
	)
		.replace(
			'const read = () => this.state.revision;',
			'const offset=2;const read = () => this.state.revision + shared + offset;const publish=(value:number)=>this.setContext(CaptureStatus,{value});'
		)
		.replace(
			'this.state.draft = 2;',
			'this.state.draft = 2;this.state.revision=props.input-2;this.state.result=props.input;'
		)
		.replace(' + shared + privateValue', ' + privateValue')
		.replace('this.setContext(CaptureStatus, { value: result });', 'publish(result);');
	source =
		'export let released=0;class Resource{dispose(){released++;}}/** @exact own */ async function acquire(){await Promise.resolve();return new Resource();}\n' +
		source;
	source = source
		.replace('const run = (', 'const run = async (')
		.replace('task: TaskContext', '{signal}: TaskContext')
		.replace(
			'void task;',
			'void signal;const __exactTaskContext=1;void __exactTaskContext;const resource=await acquire();const selected=(()=>resource)();selected.dispose?.();'
		);
	source += `
import {renderToString} from '@exactjs/ssr';
import * as rendererNamespace from '@exactjs/ssr';
import {unsafeHtml} from '@exactjs/core';
import {unmount as teardown} from '@exactjs/dom';
export let aliasBrowserExecutions=0;
function AliasBrowser(){aliasBrowserExecutions++;teardown(null as unknown as Element);return()=> <p>browser</p>;}
export function StateAliasExecutorPage(this:Component<{rows:{value:number}[][]}>){
 this.state.rows=[[{value:0}],[{value:1},{value:2}]];const [,[,selected]]=this.state.rows;
 function mutate(){selected.value++;}
 function update(task:TaskContext=TaskContext.server().blocking()){mutate();}
 update();return()=> <main><output>{selected.value}</output><AliasBrowser/></main>;
}
function HostIdentityPage(){return ()=> <p>identity</p>;}
export function hostIdentityDirect(renderToString:(value:unknown)=>string){return renderToString(<HostIdentityPage/>);}
export function hostIdentityNamespace(rendererNamespace:{renderToString(value:unknown):string}){return rendererNamespace.renderToString(<HostIdentityPage/>);}
export function hostIdentityCapability(unsafeHtml:(value:string)=>string){return unsafeHtml('safe');}
`;
	const publicationSource = await readFile(
		path.join(
			root,
			'packages/component-composition-corpus/src/test-support/state-publication.fixtures.tsx'
		),
		'utf8'
	);
	source += publicationSource.replace(
		"import { TaskContext, type Component } from '@exactjs/core';",
		''
	);
	source += '\nexport { StatePublicationProbe as StateClearExecutorPage };\n';
	const sourceRoot = path.join(temporary, 'task-capture-source');
	await mkdir(sourceRoot);
	// The shadowed render calls retain authored JSX for the host to compile.
	await writeFile(
		path.join(sourceRoot, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				jsx: 'react-jsx',
				jsxImportSource: '@exactjs/jsx',
				skipLibCheck: true
			},
			files: ['TaskCaptures.tsx']
		})
	);
	await writeFile(
		path.join(sourceRoot, 'state-publication-helper.ts'),
		await readFile(
			path.join(
				root,
				'packages/component-composition-corpus/src/test-support/state-publication-helper.ts'
			),
			'utf8'
		)
	);
	const entry = path.join(sourceRoot, 'TaskCaptures.tsx');
	await writeFile(entry, source);
	const artifacts = await compileProjectArtifacts([entry], {
		rootDir: sourceRoot,
		outDir: path.join(sourceRoot, 'artifacts'),
		generatedValidation: 'semantic'
	});
	const artifact = artifacts.find((artifact) => artifact.inputFile === entry);
	if (!artifact) throw new Error('Missing task capture artifact');
	const handler = path.join(temporary, 'task-captures-handler.mjs');
	const taskProvider = path.join(temporary, 'task-provider.mjs');
	const sourceJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/external-source-lifecycle-journey.mjs'
	);
	const cancellationJourney = path.join(
		root,
		'packages/component-composition-corpus/test-support/task-cancellation-contract-journey.mjs'
	);
	const sourceClient = path.join(temporary, 'external-source-client.mjs');
	await build({
		stdin: {
			contents: `import {createExternalSource,createSelectedExternalSource,createEffectScope,withEffectScope,watch,flushSync} from '@exactjs/reactive';
import {verifyExternalSourceLifecycle} from ${JSON.stringify(sourceJourney)};
import {TaskCancellation,isTaskCancellation} from '@exactjs/core';
import {runTaskFrame} from '@exactjs/core/framework/task-frames';
import {verifyTaskCancellationContract} from ${JSON.stringify(cancellationJourney)};
export async function runChecks(){verifyExternalSourceLifecycle({createExternalSource,createSelectedExternalSource,createEffectScope,withEffectScope,watch,flushSync});await verifyTaskCancellationContract({TaskCancellation,isTaskCancellation,runTaskFrame});return true;}`,
			resolveDir: root
		},
		bundle: true,
		platform: 'browser',
		format: 'esm',
		outfile: sourceClient,
		logLevel: 'silent'
	});
	const sourceClientCode = await readFile(sourceClient, 'utf8');
	await build({
		stdin: {
			contents:
				"export { defineTask } from '@exactjs/core/tasks'; export {TaskCancellation,isTaskCancellation} from '@exactjs/core';",
			resolveDir: root
		},
		bundle: true,
		platform: 'neutral',
		format: 'esm',
		outfile: taskProvider,
		logLevel: 'silent'
	});
	await writeFile(
		handler,
		`import {ActivationCaptureShell,ActivationCaptureInputs,CaptureStatusView,CapturePrivate,released,StateAliasExecutorPage,StateClearExecutorPage,aliasBrowserExecutions,hostIdentityDirect,hostIdentityNamespace,hostIdentityCapability} from ${JSON.stringify(artifact.serverFile)};
import {createCompiledComponentInputReceipt as receipt} from '@exactjs/core/runtime/component-operations';
import {readExactComponentContract} from '@exactjs/core/framework/component-contracts';
import {composeExactExecutorContract,createExactContextRuntime} from '@exactjs/server';
import {renderToString} from '@exactjs/ssr';
import {defineTask,TaskCancellation as ForeignCancellation,isTaskCancellation as isForeignCancellation} from ${JSON.stringify(taskProvider)};
import {TaskCancellation,isTaskCancellation} from '@exactjs/core';
import {bindTask,createTaskOwner,taskStatus} from '@exactjs/core/tasks';
import {runTaskFrame} from '@exactjs/core/framework/task-frames';
import {createServerComponentExecutionFrame,activateServerComponentTaskForHost} from '@exactjs/core/framework/server-component-execution';
import {verifyTaskFailureOwnership,verifySettledChildCancellation} from ${JSON.stringify(path.join(root, 'packages/component-composition-corpus/test-support/task-failure-ownership-journey.mjs'))};
import * as reactiveApi from '@exactjs/reactive';
import {verifyExternalSourceLifecycle} from ${JSON.stringify(sourceJourney)};
import {verifyTaskCancellationContract} from ${JSON.stringify(cancellationJourney)};
const contract=composeExactExecutorContract([ActivationCaptureShell,ActivationCaptureInputs,CaptureStatusView]);
const invoked=readExactComponentContract(ActivationCaptureInputs).continuations.find(value=>value.invocation);
const clearContract=composeExactExecutorContract([StateClearExecutorPage]);
const clearContinuation=readExactComponentContract(StateClearExecutorPage).continuations.find(value=>value.invocation&&value.dependencies.length>0);
const taskCaptureContext={contract,contextRuntime:createExactContextRuntime({requestContexts:[[CapturePrivate,{value:7}]]})};
export const taskCaptureContexts={'/task-captures/invoke':taskCaptureContext,'/task-captures/clear':{contract:clearContract}};
export async function taskCaptureResponse(request,createHandler,env,ctx){
	const pathname=new URL(request.url).pathname;
 if(pathname==='/task-captures/cancellation-contract'){
  await verifyTaskCancellationContract({TaskCancellation,isTaskCancellation,runTaskFrame},{TaskCancellation:ForeignCancellation,isTaskCancellation:isForeignCancellation});
  const owner=createTaskOwner();
  try{
   let failing=true;
   const error=new TaskCancellation('host'),task=defineTask({owner},()=>{if(failing)throw error;return 1;});
   const outcome=await Promise.resolve(task()).catch(value=>value);
   const status=taskStatus(task,{owner});
   if(outcome!==error||status.error!==undefined||status.pendingCount!==0)throw new Error('Foreign task recorded cancellation as application failure');
   failing=false;if(await task()!==1)throw new Error('Foreign cancellation blocked subsequent work');
  }finally{await owner[Symbol.asyncDispose]();}
  return Response.json({verified:true});
 }
 if(pathname==='/task-captures/external-source-client')return new Response(${JSON.stringify(sourceClientCode)},{headers:{'content-type':'text/javascript'}});
 if(pathname==='/task-captures/external-source'){
  verifyExternalSourceLifecycle(reactiveApi);
  return Response.json({verified:true});
 }
 if(pathname==='/task-captures/failure-ownership'){
  await verifyTaskFailureOwnership(work=>runTaskFrame({kind:'failure'},{work}));
  await verifyTaskFailureOwnership(async work=>{
   const host={};let execution;
   const frame=createServerComponentExecutionFrame(host,{observe(value){execution=value;}});
   try{
    activateServerComponentTaskForHost(host,[[],[],'blocking','failure'],'failure',work);
    return await execution;
   }finally{await frame[Symbol.asyncDispose]();}
  });
  await verifySettledChildCancellation(runTaskFrame);
  return Response.json({verified:true});
 }
 if(pathname==='/task-captures/provider-ownership'){
  const observations=[];
  for(const detached of [false,true]){
   let release,markStarted,childSignal,childOutcome,parentSettled=false;
   const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>markStarted=resolve);
   const child=defineTask({detached},async context=>{childSignal=context.signal;markStarted();await gate;return 'child';});
   const parent=runTaskFrame({kind:'provider-ownership'},{work(){childOutcome=Promise.resolve(child()).catch(error=>error);return 'parent';}});
   const parentOutcome=parent.then(value=>{parentSettled=true;return value;},error=>error);
   try{
    await started;await new Promise(resolve=>setTimeout(resolve,0));
    const settled=parentSettled;
    parent.cancel('cancel-parent');await new Promise(resolve=>setTimeout(resolve,0));
    observations.push({detached,parentSettled:settled,childAborted:childSignal.aborted});
   }finally{release();await Promise.allSettled([parentOutcome,childOutcome]);}
  }
  return Response.json(observations);
 }
 if(pathname==='/task-captures/provider-task'){
  const owner=createTaskOwner();
  try{
   const task=defineTask({owner,concurrency:'queue'},value=>Promise.resolve(value));
   const bound=bindTask(task,{owner});
   const values=await Promise.all([task(1),bound(2)]);
   return Response.json({values,pending:bound.pendingCount,next:await bound(3)});
  }finally{await owner[Symbol.asyncDispose]();}
 }
 if(pathname==='/task-captures/host-identity'){
  const receipts=[];const callback=value=>(receipts.push(Boolean(value)),'ordinary');
  return Response.json({direct:hostIdentityDirect(callback),namespace:hostIdentityNamespace({renderToString:callback}),capability:hostIdentityCapability(value=>'local:'+value),receipts});
 }
 if(pathname==='/task-captures/state-alias'){const rendered=await renderToString(receipt(StateAliasExecutorPage,{}),{markers:false});return Response.json({html:rendered.html,browserExecutions:aliasBrowserExecutions});}
 if(pathname==='/task-captures/clear-contract')return Response.json({id:clearContinuation.id,dependencies:clearContinuation.dependencies.length});
 if(pathname==='/task-captures/resources')return Response.json({released});
 if(pathname==='/task-captures/contract')return Response.json({id:invoked.id});
 if(pathname==='/task-captures/ssr')return Response.json(await renderToString(receipt(ActivationCaptureShell,{}),{contexts:new Map([[CapturePrivate.id,7]])}));
 return createHandler(taskCaptureContext)(request,env,ctx);
}
`
	);
	const clientFile = path.join(temporary, 'task-captures-client.mjs');
	await build({
		stdin: {
			contents: `import {StateClearExecutorPage} from ${JSON.stringify(artifact.clientFile)};
import {composeExactComponentContracts,readExactComponentContract} from '@exactjs/core/framework/component-contracts';
const composed=composeExactComponentContracts([StateClearExecutorPage],'client');
export const continuation=readExactComponentContract(StateClearExecutorPage).continuations.find(value=>value.invocation&&value.dependencies.length>0);
export const binding=composed.continuationArrays[continuation.id];`,
			resolveDir: root
		},
		outfile: clientFile,
		bundle: true,
		platform: 'node',
		format: 'esm',
		packages: 'external',
		logLevel: 'silent'
	});
	const clearClient = await import(pathToFileURL(clientFile).href);
	return { handler, clearClient };
}

/** Runs the shared external-source lifecycle journey in the browser using the host's bundled client asset. */
export async function checkExternalSourceBrowser(origin, browser) {
	const page = await browser.newPage();
	try {
		await page.goto(new URL('/task-captures/external-source', origin).href);
		assert.equal(
			await page.evaluate(async () => {
				const journey = await import('/task-captures/external-source-client');
				return journey.runChecks();
			}),
			true
		);
	} finally {
		await page.close();
	}
}

/** Checks helper closures, captured argument slots and shared writes through every native host. */
export async function checkTaskCaptures(origin, clearClient) {
	assert.deepEqual(
		await json(await request(new URL('/task-captures/cancellation-contract', origin))),
		{ verified: true }
	);
	assert.deepEqual(await json(await request(new URL('/task-captures/external-source', origin))), {
		verified: true
	});
	assert.deepEqual(await json(await request(new URL('/task-captures/failure-ownership', origin))), {
		verified: true
	});
	assert.deepEqual(
		await json(await request(new URL('/task-captures/provider-ownership', origin))),
		[
			{ detached: false, parentSettled: false, childAborted: true },
			{ detached: true, parentSettled: true, childAborted: false }
		]
	);
	assert.deepEqual(await json(await request(new URL('/task-captures/provider-task', origin))), {
		values: [1, 2],
		pending: 0,
		next: 3
	});
	assert.deepEqual(await json(await request(new URL('/task-captures/host-identity', origin))), {
		direct: 'ordinary',
		namespace: 'ordinary',
		capability: 'local:safe',
		receipts: [true, true]
	});
	const alias = await json(await request(new URL('/task-captures/state-alias', origin)));
	assert.match(alias.html, /<output>3<\/output>/);
	assert.equal(alias.browserExecutions, 0);
	const rendered = await json(await request(new URL('/task-captures/ssr', origin)));
	assert.match(rendered.html, /data-result(?:="true")?>26<\/output>/);
	assert.match(rendered.html, /data-status(?:="true")?>26<\/output>/);
	const { id } = await json(await request(new URL('/task-captures/contract', origin)));
	for (const [value, revision, expected] of [
		[5, 1, 26],
		[6, 1, 28],
		[7, 2, 31]
	]) {
		const result = await json(
			await request(new URL('/task-captures/invoke', origin), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					type: 'invoke',
					id,
					payload: { dependencies: [value, value + 1, 2] },
					state: { revision },
					publicContext: { CaptureShared: 5 }
				})
			})
		);
		assert.equal(result.ok, true);
		assert.deepEqual(result.state, { result: expected });
		assert.deepEqual(result.contexts, { CaptureStatus: { value: expected } });
	}
	await verifyStatePublicationJourney({
		endpoint: new URL('/task-captures/clear', origin).href,
		...clearClient
	});
	const cleanup = await json(await request(new URL('/task-captures/resources', origin)));
	assert.equal(cleanup.released, 4);
}
