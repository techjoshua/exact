import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { compileProjectArtifacts } from '@exactjs/compiler';
import { request, json } from './test-support.mjs';

/** Builds the owned capture fixture for native SSR and each host's request adapter. */
export async function prepareTaskCaptures(root, temporary) {
	const source = (
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
			'const read = () => this.state.revision + shared;const publish=(value:number)=>this.setContext(CaptureStatus,{value});'
		)
		.replace(' + shared + privateValue', ' + privateValue')
		.replace('this.setContext(CaptureStatus, { value: result });', 'publish(result);');
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
		`import {ActivationCaptureShell,ActivationCaptureInputs,CaptureStatusView,CapturePrivate} from ${JSON.stringify(artifact.serverFile)};
import {createCompiledComponentReceipt as receipt} from '@exactjs/core/runtime/component-operations';
import {readExactComponentContract} from '@exactjs/core/framework/component-contracts';
import {composeExactExecutorContract,createExactContextRuntime} from '@exactjs/server';
import {renderToString} from '@exactjs/ssr';
const contract=composeExactExecutorContract([ActivationCaptureShell,ActivationCaptureInputs,CaptureStatusView]);
const invoked=readExactComponentContract(ActivationCaptureInputs).continuations.find(value=>value.invocation);
export const taskCaptureContext={contract,contextRuntime:createExactContextRuntime({requestContexts:[[CapturePrivate,{value:7}]]})};
export async function taskCaptureResponse(request,createHandler,env,ctx){
 const pathname=new URL(request.url).pathname;
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
	const rendered = await json(await request(new URL('/task-captures/ssr', origin)));
	assert.match(rendered.html, /data-result(?:="true")?>24<\/output>/);
	assert.match(rendered.html, /data-status(?:="true")?>24<\/output>/);
	const { id } = await json(await request(new URL('/task-captures/contract', origin)));
	for (const [value, revision, expected] of [
		[5, 1, 24],
		[6, 1, 26],
		[7, 2, 29]
	]) {
		const result = await json(
			await request(new URL('/task-captures/invoke', origin), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					type: 'invoke',
					id,
					payload: { dependencies: [value, value + 1] },
					state: { revision },
					publicContext: { CaptureShared: 5 }
				})
			})
		);
		assert.equal(result.ok, true);
		assert.deepEqual(result.state, { result: expected });
		assert.deepEqual(result.contexts, { CaptureStatus: { value: expected } });
	}
}
