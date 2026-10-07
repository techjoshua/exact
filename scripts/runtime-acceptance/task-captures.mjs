import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { compileProjectArtifacts } from '@exactjs/compiler';
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
	const entry = path.join(temporary, 'TaskCaptures.tsx');
	await writeFile(entry, source);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: temporary,
		outDir: path.join(temporary, 'task-captures'),
		generatedValidation: 'semantic'
	});
	const handler = path.join(temporary, 'task-captures-handler.mjs');
	await writeFile(
		handler,
		`import {ActivationCaptureShell,ActivationCaptureInputs,CaptureStatusView,CapturePrivate,released,StateAliasExecutorPage,aliasBrowserExecutions,hostIdentityDirect,hostIdentityNamespace,hostIdentityCapability} from ${JSON.stringify(artifact.serverFile)};
import {createCompiledComponentReceipt as receipt} from '@exactjs/core/runtime/component-operations';
import {readExactComponentContract} from '@exactjs/core/framework/component-contracts';
import {composeExactExecutorContract,createExactContextRuntime} from '@exactjs/server';
import {renderToString} from '@exactjs/ssr';
const contract=composeExactExecutorContract([ActivationCaptureShell,ActivationCaptureInputs,CaptureStatusView]);
const invoked=readExactComponentContract(ActivationCaptureInputs).continuations.find(value=>value.invocation);
export const taskCaptureContext={contract,contextRuntime:createExactContextRuntime({requestContexts:[[CapturePrivate,{value:7}]]})};
export async function taskCaptureResponse(request,createHandler,env,ctx){
	const pathname=new URL(request.url).pathname;
 if(pathname==='/task-captures/host-identity'){
  const receipts=[];const callback=value=>(receipts.push(Boolean(value)),'ordinary');
  return Response.json({direct:hostIdentityDirect(callback),namespace:hostIdentityNamespace({renderToString:callback}),capability:hostIdentityCapability(value=>'local:'+value),receipts});
 }
 if(pathname==='/task-captures/state-alias'){const rendered=await renderToString(receipt(StateAliasExecutorPage,{}),{markers:false});return Response.json({html:rendered.html,browserExecutions:aliasBrowserExecutions});}
 if(pathname==='/task-captures/resources')return Response.json({released});
 if(pathname==='/task-captures/contract')return Response.json({id:invoked.id});
 if(pathname==='/task-captures/ssr')return Response.json(await renderToString(receipt(ActivationCaptureShell,{}),{contexts:new Map([[CapturePrivate.id,7]])}));
 return createHandler(taskCaptureContext)(request,env,ctx);
}
`
	);
	return handler;
}

/** Checks helper closures, captured argument slots and shared writes through every native host. */
export async function checkTaskCaptures(origin) {
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
	const cleanup = await json(await request(new URL('/task-captures/resources', origin)));
	assert.equal(cleanup.released, 4);
}
