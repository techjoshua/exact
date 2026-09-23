import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';

const examples = [
	{
		name: 'component child selectors',
		source: `import {partitionChildren} from '@exactjs/core/children';import type {Child} from '@exactjs/core';function Title(){return ()=> <h1>Title</h1>;}export function Panel(props:{children?:Child}){const parts=partitionChildren(props.children,{title:Title});return ()=> <section>{parts.title}</section>;}`,
		invalid: ['title:Title', 'title:42'],
		code: 'TS2322',
		token: 'title'
	},
	{
		name: 'component array props without explicit receiver',
		source: `export function Shell(props:{assets:{styles:string[]}}){return ()=> <head>{props.assets.styles.map(href => <link rel="stylesheet" href={href}/>)}</head>;}`,
		invalid: ['href={href}', 'href={href.missing}'],
		code: 'TS2339',
		token: 'missing'
	},
	{
		name: 'nested server task arguments',
		source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:string}>){async function child(value:string,task:TaskContext=TaskContext.server()){return value;} async function parent(task:TaskContext=TaskContext.server().blocking()){this.state.value=await child('ready');} void parent();return ()=> <p>{this.state.value}</p>;}`,
		invalid: ["child('ready')", 'child(42)'],
		code: 'TS2345',
		token: '42'
	},
	{
		name: 'nested server task result',
		source: `import {TaskContext,type Component} from '@exactjs/core';export function Page(this:Component<{value:string}>){async function child(task:TaskContext=TaskContext.server()){return 'ready';} async function parent(task:TaskContext=TaskContext.server().blocking()){const value:string=await child();this.state.value=value;} void parent();return ()=> <p>{this.state.value}</p>;}`,
		invalid: ['value:string=await child()', 'value:number=await child()'],
		code: 'TS2322',
		token: 'value'
	},
	{
		name: 'keyed helper',
		source: `export function view(items: {id: string}[]) { return <ul>{items.map(item => <li key={item.id}>{item.id}</li>)}</ul>; }`,
		invalid: ['{item.id}</li>', '{item.missing}</li>'],
		code: 'TS2339',
		token: 'missing'
	},
	{
		name: 'awaited object assignment',
		source: `import {TaskContext,type Component} from '@exactjs/core'; async function fetchValue(value: string = 'ok'){return value;} export function Page(this:Component<{initial:{draft:string;preview:string}}>) {const load=async(task:TaskContext=TaskContext.server().blocking())=>{this.state.initial={draft:'x',preview:await fetchValue()};};void load();return ()=> <p>{this.state.initial.preview}</p>;}`,
		invalid: ['await fetchValue()', 'await fetchValue(123)'],
		code: 'TS2345',
		token: '123'
	},
	{
		name: 'annotated derived union',
		source: `function Child(props:{intro:'example'|'shared'}) {return () => <p>{props.intro}</p>;} export function selectPage(kind:string) {const intro:'example'|'shared'=kind==='example'?'example':'shared';return {render:()=> <Child intro={intro}/>};}`,
		invalid: ["?'example':'shared'", "?'invalid':'shared'"],
		code: 'TS2322',
		token: 'invalid'
	},
	{
		name: 'guarded optional state',
		source: `import type {Component} from '@exactjs/core'; export function Page(this:Component<{preview?:{hash:string}}>){return ()=> this.state.preview ? <dl><dd>{this.state.preview.hash}</dd></dl>:<p>none</p>}`,
		invalid: ['this.state.preview ?', 'true ?'],
		code: 'TS2532',
		token: 'this.state.preview'
	},
	{
		name: 'local discriminant narrowing',
		source: `type Route={kind:'report';hash:string}|{kind:'home'};declare function matchRoute(url:string):Route;export function selectPage(url:string){const route=matchRoute(url);if(route.kind==='report'){const hash=route.hash;return {render:()=> <p>{hash}</p>};}return {render:()=> <p>home</p>};}`,
		invalid: ["route.kind==='report'", "route.kind==='home'"],
		code: 'TS2339',
		token: 'hash'
	}
] as const;

it.each(examples)(
	'preserves valid $name semantics and rejects an invalid variant',
	({ name, source, invalid, code, token }) => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const id = path.resolve(`.tmp/checking-projection-${name.replaceAll(' ', '-')}.tsx`);
		const check = (input: string) =>
			compiler.request({
				kind: 'check',
				id,
				source: input,
				root: process.cwd(),
				target: 'default',
				diagnostics: 'semantic'
			});
		const valid = check(source);
		expect(valid.error).toBeUndefined();
		expect(valid.diagnostics).toEqual([]);
		for (const target of ['client', 'server'] as const) {
			const result = compiler.request({
				kind: 'compile',
				id,
				source,
				root: process.cwd(),
				target,
				diagnostics: 'syntax'
			});
			expect(result.error).toBeUndefined();
			expect(result.diagnostics).toEqual([]);
		}
		const invalidSource = source.replace(invalid[0], invalid[1]);
		const diagnostics = check(invalidSource).diagnostics.filter(
			(diagnostic) => diagnostic.code === code
		);
		expect(diagnostics.length).toBeGreaterThan(0);
		for (const diagnostic of diagnostics) {
			expect(diagnostic.filename).toBe(id);
			expect(diagnostic.start).toBeGreaterThanOrEqual(0);
			expect(diagnostic.start! + diagnostic.length!).toBeLessThanOrEqual(invalidSource.length);
			expect(
				invalidSource.slice(diagnostic.start, diagnostic.start! + diagnostic.length!)
			).toContain(token);
		}
	}
);
