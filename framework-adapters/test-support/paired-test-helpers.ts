import { compileFileArtifacts } from '@exactjs/compiler';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Creates owned SSR-helper and reactive-client fixtures in the caller's disposable test root. */
export async function writePairedTestHelpers(root: string): Promise<{
	filename: string;
	source: string;
}> {
	await mkdir(path.join(root, 'src'), { recursive: true });
	await writeFile(
		path.join(root, 'package.json'),
		JSON.stringify({ name: 'paired-test', private: true, type: 'module' })
	);
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				jsx: 'preserve',
				jsxImportSource: '@exactjs/jsx',
				skipLibCheck: true
			},
			include: ['src', 'generated']
		})
	);
	const page = path.join(root, 'src/Page.tsx');
	// A server effect makes the helper's placement unambiguously server-owned.
	await writeFile(
		page,
		`import {hostname} from 'node:os';
/** @exact server */
export function Page({label}:{label:string}){const host=hostname();return()=> <p data-host={host}>{label}</p>;}`
	);
	await compileFileArtifacts(page, {
		rootDir: path.join(root, 'src'),
		outDir: path.join(root, 'generated'),
		serverComponents: true
	});
	const progress = path.join(root, 'src/progress.ts');
	await writeFile(
		progress,
		`import {createTaskProgressReporter} from '@exactjs/core/framework/server-task-helpers';import type {TaskContext} from '@exactjs/core';export function bindProgress(task:TaskContext){return createTaskProgressReporter('progress',task);}`
	);
	await compileFileArtifacts(progress, {
		rootDir: path.join(root, 'src'),
		outDir: path.join(root, 'generated'),
		serverComponents: true
	});
	await writeFile(
		path.join(root, 'src/progress-check.ts'),
		`import {createExactContinuationHandler} from '@exactjs/server';import {bindProgress} from '../generated/progress.exact.server.js';
 export async function runServerProgress(){const reports:unknown[]=[];let retained:((snapshot:unknown)=>void)|undefined;
 const contract={id:'task',componentId:'page',kind:'task' as const,dependencies:[],stateReads:[],stateWrites:[],publicContexts:[],serverContexts:[],contextWrites:[],boundaries:[],progress:[{id:'progress'}]};
 const handler=createExactContinuationHandler(contract,{id:'task',componentId:'page',execute(activation,execution){retained=bindProgress(execution.task);retained(42);return {state:activation.state};}});
 await handler({type:'invoke',id:'task',payload:{dependencies:[]},state:{}},{reportTaskProgress:(id,snapshot)=>reports.push([id,snapshot])});
 retained!(99);return reports;}`
	);
	const filename = path.join(root, 'src/helper.tsx');
	const source = `import {Page} from '../generated/Page.exact.server.js';
export function serverFixture(){return <Page label="Visible"/>;}`;
	await writeFile(filename, source);
	await writeFile(
		path.join(root, 'src/client.tsx'),
		`import type {Component} from '@exactjs/core';
export function Counter(this:Component<{count:number}>){this.state.count=0;return()=> <button onClick={()=>this.state.count++}>{this.state.count}</button>;}`
	);
	return { filename, source };
}
