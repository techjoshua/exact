import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertCompilerClosedServerBundle } from '../../scripts/compiler-closed-server-bundle.mjs';

/** Owns an adapter-neutral scheduled SSR fixture with no client reactive requirements. */
export async function createCompilerClosedSsrFixture() {
	const workspace = fileURLToPath(new URL('../../', import.meta.url));
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/closed-ssr-'));
	const dispose = () => rm(root, { recursive: true, force: true });
	try {
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({ name: 'compiler-closed-ssr-fixture', private: true, type: 'module' })
		);
		await writeFile(path.join(root, 'exact.config.mjs'), 'export default {};');
		await writeFile(
			path.join(root, 'Page.tsx'),
			`
import {TaskContext,type Component} from '@exactjs/core';
import {renderToString} from '@exactjs/ssr';
function Leaf(this:Component<{value:number}>,props:{value:number}) {
 this.state.value=0;
 async function prepare(task:TaskContext=TaskContext.server().blocking()) {
  await Promise.resolve(); this.state.value=props.value+1;
 }
 prepare();
 return ()=><span>{this.state.value}</span>;
}
function Page() {return ()=><main><Leaf value={41}/><Leaf value={42}/></main>;}
export async function run() {
 let direct=0; let generic=0;
 const result=await renderToString(<Page/>, {markers:false,
  onDirectComponentCreated:()=>direct++, onComponentCreated:()=>generic++});
 return {html:result.html,direct,generic};
}
`
		);
		await writeFile(
			path.join(root, 'run.ts'),
			// A successful runtime may emit warnings; stderr alone is not a failed rendering contract.
			"import {run} from './Page.js'; process.emitWarning('fixture runtime warning'); console.log(JSON.stringify(await run()));"
		);
		return { root, workspace, dispose };
	} catch (error) {
		await dispose();
		throw error;
	}
}

/** Checks retained code and executes the same observable contract in the adapter's native host. */
export async function verifyCompilerClosedSsr(filename: string, executable = process.execPath) {
	assertCompilerClosedServerBundle(await readFile(filename, 'utf8'));
	const result = await promisify(execFile)(executable, [filename], { timeout: 10000 });
	const rendered = JSON.parse(result.stdout) as { html: string; direct: number; generic: number };
	// Partition authority is compiler-owned; assert rendered values independently of opaque IDs.
	return {
		text: rendered.html.replace(/<[^>]*>/g, ''),
		direct: rendered.direct,
		generic: rendered.generic
	};
}

/** Stable rendering and ownership expectations shared by all build adapters. */
export const compilerClosedSsrResult = {
	text: '4243',
	direct: 3,
	generic: 0
};
