import { fileURLToPath } from 'node:url';
/** Native server entry points differ only in host transport ownership and shutdown. */
export function hostSource(
	runtime,
	{
		reactPipeableAcceptance = false,
		ssrSchedulerAcceptance = false,
		serverCancellationAcceptance = false
	} = {}
) {
	const scheduler = ssrSchedulerAcceptance
		? `import {AsyncSsrScheduler} from ${JSON.stringify(fileURLToPath(new URL('../../packages/ssr/dist/render/async-scheduler.js', import.meta.url)))};
import {produceProgressiveHtml} from ${JSON.stringify(fileURLToPath(new URL('../../packages/ssr/dist/stream/production.js', import.meta.url)))};
import {prepareComponentProps,prepareDirectComponentProps} from ${JSON.stringify(fileURLToPath(new URL('../../packages/ssr/dist/render/component-props.js', import.meta.url)))};
import {markContinuationDependencyValue} from ${JSON.stringify(fileURLToPath(new URL('../../packages/core/dist/server/tasks/dependency-provenance.js', import.meta.url)))};
import {createContinuationDependencySlot} from '@exactjs/core';
\n`
		: '';
	const cancellation = serverCancellationAcceptance
		? `import {createTaskOwner,taskAwait} from '@exactjs/core';
import {createTaskOwnerRecord,executeTaskFrame} from ${JSON.stringify(fileURLToPath(new URL('../../packages/core/dist/server/tasks/frame-runtime.js', import.meta.url)))};
import {createTaskProgressReceiver} from ${JSON.stringify(fileURLToPath(new URL('../../packages/core/dist/server/tasks/progress-receiver.js', import.meta.url)))};
import {dispatchExactBatch} from ${JSON.stringify(fileURLToPath(new URL('../../packages/server/dist/streaming.js', import.meta.url)))};
import {readBody} from ${JSON.stringify(fileURLToPath(new URL('../../packages/server/dist/protocol.js', import.meta.url)))};
import {createProgressStream} from ${JSON.stringify(fileURLToPath(new URL('../../packages/server/dist/progress/stream.js', import.meta.url)))};

`
		: '';
	const prelude = scheduler + cancellation;
	if (runtime === 'cloudflare') return prelude + 'export default app;';
	const settlement = reactPipeableAcceptance
		? `import {verifyReactPipeableSettlement} from ${JSON.stringify(fileURLToPath(new URL('../../packages/component-composition-corpus/test-support/react-pipeable-settlement-journey.ts', import.meta.url)))};
import {renderToPipeableStream} from '@exactjs/react-dom-compat/server19';
import {resumeToPipeableStream} from '@exactjs/react-dom-compat/static19';
await verifyReactPipeableSettlement({renderToPipeableStream,resumeToPipeableStream});
`
		: '';
	if (runtime === 'deno')
		return (
			prelude +
			settlement +
			`const server=Deno.serve({hostname:'127.0.0.1',port:0,onListen(){}},request=>app.fetch(request));
console.log('RUNTIME_READY http://127.0.0.1:'+server.addr.port);`
		);
	if (runtime === 'bun')
		return (
			prelude +
			settlement +
			`const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:(request,server)=>app.fetch(request,server)});
console.log('RUNTIME_READY http://127.0.0.1:'+server.port);
process.on('SIGTERM',()=>{server.stop(true);});`
		);
	return (
		prelude +
		settlement +
		`import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createExactNodeHandler} from '@exactjs/node-adapter';
const handlers=Object.fromEntries(Object.entries(app.contexts).map(([path,context])=>[path,createExactNodeHandler(context)]));
const server=createServer(async(request,response)=>{
 const url=new URL(request.url,'http://'+request.headers.host);
 const handler=handlers[url.pathname];
 if(handler){handler(request,response);return;}
 const abort=new AbortController();
 response.once('close',()=>{if(!response.writableFinished)abort.abort();});
 try{
  const output=await app.fetch(new Request(url,{headers:request.headers,signal:abort.signal}));
  response.writeHead(output.status,Object.fromEntries(output.headers));
  if(output.body)await pipeline(Readable.fromWeb(output.body),response);else response.end();
 }catch(error){console.error(error);response.destroy(error);}
});
server.listen(0,'127.0.0.1',()=>console.log('RUNTIME_READY http://127.0.0.1:'+server.address().port));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close();});`
	);
}
