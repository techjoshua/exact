/** Native server entry points differ only in host transport ownership and shutdown. */
export function hostSource(runtime) {
	if (runtime === 'cloudflare') return 'export default app;';
	if (runtime === 'deno')
		return `const server=Deno.serve({hostname:'127.0.0.1',port:0,onListen(){}},request=>app.fetch(request));
console.log('RUNTIME_READY http://127.0.0.1:'+server.addr.port);`;
	if (runtime === 'bun')
		return `const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:(request,server)=>app.fetch(request,server)});
console.log('RUNTIME_READY http://127.0.0.1:'+server.port);
process.on('SIGTERM',()=>{server.stop(true);});`;
	return `import {createServer} from 'node:http';
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
 }catch(error){response.destroy(error);}
});
server.listen(0,'127.0.0.1',()=>console.log('RUNTIME_READY http://127.0.0.1:'+server.address().port));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close();});`;
}
