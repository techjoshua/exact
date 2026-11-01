import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
	buildDiagnosticFixture,
	assertDiagnosticBuildWarnings
} from './compiler-diagnostic-build.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Verifies host-selected identity and HTTP publication through normal workspace adapter packages.
 * The compiler-diagnostics fixture owns the root and cleanup. Only server builds run here.
 */
export async function verifyHostSelectedHelperContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
): Promise<void> {
	const sibling = root + '-sibling';
	await mkdir(sibling, { recursive: true });
	try {
		for (const kind of ['js', 'mjs', 'intl']) {
			const helperDirectory = kind === 'js' ? sibling : root;
			const helperImport = kind === 'js' ? '../' + path.basename(sibling) + '/helper' : './helper';
			const localEnhancement =
				kind === 'js' ? `import {local} from './local.js' with {type:'exact-enhancement'};` : '';
			if (kind === 'js')
				await Promise.all([
					writeFile(
						path.join(root, 'local.tsx'),
						`export {local} from './local-implementation.js' with {type:'exact-enhancement'};`
					),
					writeFile(
						path.join(root, 'local-implementation.tsx'),
						"import type {Child,Component} from '@exactjs/core';export function local(this:Component<{}>,props:{children?:Child;mark:string}){return()=> <_target data-local={props.mark}/>;}"
					)
				]);
			const suffix = kind === 'intl' ? 'jsx' : kind;
			const intlSource =
				kind === 'intl'
					? `import * as intl from '@exactjs/intl/enhancements' with {type:'exact-enhancement'};export function Label(){return()=> <p intl:message>Hello helper</p>}`
					: '';

			const typed = kind === 'intl' ? 'tsx' : suffix === 'js' ? 'ts' : 'mts';
			await Promise.all(
				Object.entries({
					'package.json': JSON.stringify({
						name: '@fixture/host-selected-helper',
						private: true,
						type: 'module'
					}),
					'exact.config.mjs': 'export default {};',
					'tsconfig.json': JSON.stringify({
						compilerOptions: {
							target: 'ES2022',
							module: 'ESNext',
							moduleResolution: 'Bundler',
							jsx: 'preserve',
							strict: true
						},
						include: ['*.ts', '*.tsx', '*.jsx', '*.js', '*.mts', '*.mjs']
					}),
					[path.relative(root, path.join(helperDirectory, `helper.${typed}`))]:
						'export function apply(state:{value:number}){state.value=2;}export const identity=apply;' +
						intlSource,
					[path.relative(root, path.join(helperDirectory, `helper.${suffix}`))]:
						'/** @param {{value:number}} state */ export function apply(state){state.value=99;}export const identity=apply;' +
						intlSource,
					'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';import {apply} from '${helperImport}.${suffix}';${localEnhancement}export function Page(this:Component<{value:number}>){this.state.value=0;async function save(task:TaskContext=TaskContext.server()){apply(this.state);return this.state.value;}return()=> <button ${kind === 'js' ? 'local:mark="owned"' : ''} onClick={()=>save()}>save</button>;}`,
					// The ordinary sibling import may load the helper before the component transform.
					'entry.tsx': `export {Page} from './page.js';import {apply,identity} from '${helperImport}.${suffix}';${kind === 'js' ? "import {Page} from './page.js';import {renderToString} from '@exactjs/ssr';export async function localHtml(){return (await renderToString(<Page/>)).html;}" : ''}export function ordinary(){const state={value:0};apply(state);return {value:state.value,same:apply===identity,name:apply.name,length:apply.length};}`
				}).map(([name, source]) => writeFile(path.join(root, name), source))
			);
			const warnings = await buildDiagnosticFixture(
				adapter,
				root,
				'server',
				kind === 'intl',
				true,
				false,
				workspace,
				kind === 'js' ? [root + path.sep, path.join(sibling, 'helper.js')] : undefined
			);
			await assertDiagnosticBuildWarnings(adapter, root, 'server', warnings);
			const entry = (await readdir(path.join(root, 'out-server'))).find((file) =>
				/^entry\.(?:js|mjs|cjs)$/.test(file)
			);
			assert.ok(entry, 'Missing server artifact');
			const runner = path.join(root, 'verify.mjs');
			await writeFile(
				runner,
				`import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {composeExactExecutorContract} from '@exactjs/server';
import {createExactNodeHandler} from '@exactjs/node-adapter';
import {encodeReactiveProtocolValue,decodeReactiveProtocolValue} from '@exactjs/core';
const namespace=await import('./out-server/${entry}');
const fixture=namespace.Page?namespace:namespace.default;
${kind === 'js' ? `assert.match(await fixture.localHtml(),/data-local="owned"/);` : ''}
const ordinary=fixture.ordinary();
const contract=composeExactExecutorContract([fixture.Page]);
const operations=Object.values(contract.invocations),reports=[],observations=[];
const server=createServer(createExactNodeHandler({contract,invocations:{},logger:{isEnabled:()=>true,log:report=>reports.push(report)}}));
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const origin='http://127.0.0.1:'+server.address().port;
 for(const operation of operations)for(const generation of [1,2]){
  const input={type:'invoke',id:operation.id,state:{value:0},payload:{generation,dependencies:[]}};
  const response=await fetch(origin+'/__exact',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(encodeReactiveProtocolValue(generation===1?input:{type:'batch',operations:[input]})),signal:AbortSignal.timeout(5000)});
  const bytes=await response.text();observations.push({status:response.status,bytes,result:decodeReactiveProtocolValue(JSON.parse(bytes)),generation});
 }
}finally{server.closeAllConnections();if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
assert.deepEqual(ordinary,{value:99,same:true,name:'apply',length:1});assert.equal(operations.length,1);
for(const observation of observations){assert.equal(observation.status,200,observation.bytes);const result=observation.generation===1?observation.result:observation.result.results[0];assert.equal(result.ok,true);assert.equal(result.value,99);assert.deepEqual(result.state,{value:99})}
assert.deepEqual(reports,[]);`
			);
			for (const file of [`helper.${typed}`, `helper.${suffix}`, 'page.tsx', 'entry.tsx'])
				await rm(path.join(file.startsWith('helper.') ? helperDirectory : root, file));
			await promisify(execFile)(process.execPath, [runner], { cwd: root });
		}
	} finally {
		await rm(sibling, { recursive: true, force: true });
	}
}
