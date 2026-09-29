import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';

const examples = [
	...['copy', 'helpers.copy', 'props.copy', 'String'].map((callback) => ({
		name: 'map callback reference ' + callback,
		semanticArtifacts: true,
		source: `import {peek} from '@exactjs/core';function copy(value:number){return String(value);}const helpers={copy};export function Probe(props:{ids:number[];copy:(value:number)=>string}){const rows=peek(()=>props.ids.map(${callback}));return ()=> <p>{rows.join(',')}</p>;}`,
		invalid: ["rows.join(',')", 'rows.missing'],
		code: 'TS2339',
		token: 'missing'
	})),
	{
		name: 'inferred keys through rendered array containers',
		semanticArtifacts: true,
		source: `import type {Child} from '@exactjs/core'; export function Probe(props:{ids:number[]}) {return ()=> <section><ul>{[props.ids.map(id=><li>{id}</li>)]}</ul><ul>{[...props.ids.map(id=><li>{id}</li>)]}</ul><ul>{props.ids.map(id=><li>{id}</li>) satisfies Child[]}</ul><p>{[...props.ids.map(id=>id*2)].join(',')}</p></section>;}`,
		invalid: ['id*2', 'id.missing'],
		code: 'TS2339',
		token: 'missing'
	},
	{
		name: 'keyed JSX function and block callbacks',
		semanticArtifacts: true,
		source: `export function Probe(props:{ids:number[]}){return ()=> <section><ul>{props.ids.map(function(id){const label=String(id);return <li key={id}>{label}</li>;}).slice()}</ul><ul>{[...props.ids.map(id=>{return <li key={id}>{id}</li>;})]}</ul></section>;}`,
		invalid: ['String(id)', 'String(id.missing)'],
		code: 'TS2339',
		token: 'missing'
	},

	{
		name: 'keyed JSX array type checking',
		semanticArtifacts: true,
		source: `import type {Child} from '@exactjs/core';export function Probe(props:{ids:number[]}){return ()=> <ul>{props.ids.map(id=><li key={id}>{id}</li>) satisfies Child[]}</ul>;}`,
		invalid: ['{id}</li>', '{id.missing}</li>'],
		code: 'TS2339',
		token: 'missing'
	},
	{
		name: 'keyed JSX nested arrays',
		semanticArtifacts: true,
		source: `export function Probe(props:{ids:number[]}){return ()=> <ul>{[props.ids.map(id=><li key={id}>{id}</li>)]}</ul>;}`,
		invalid: ['{id}</li>', '{id.missing}</li>'],
		code: 'TS2339',
		token: 'missing'
	},

	{
		name: 'inline collection data projection',
		semanticArtifacts: true,
		source: `export function Probe(props:{rows:ReadonlyMap<number,string>}){return ()=> <ul>{Array.from(props.rows.keys()).map(id=>({id,label:String(id)})).map(row=><li key={row.id}>{row.label}</li>)}</ul>;}`,
		invalid: ['{row.label}</li>', '{row.missing}</li>'],
		code: 'TS2339',
		token: 'missing'
	},
	{
		name: 'collection data consumed by a JSX expression',
		semanticArtifacts: true,
		source: `export function Probe(props:{values:number[]}){return ()=> <p>{props.values.map(value=>value*2).join(',')}</p>;}`,
		invalid: ['value*2', 'value.missing'],
		code: 'TS2339',
		token: 'missing'
	},
	{
		name: 'nested data transforms within a rendered list',
		semanticArtifacts: true,
		source: `export function Probe(props:{values:number[]}){return ()=> <ul>{props.values.map(value=><li key={value}>{[value].map(item=>item*2).join(',')}</li>)}</ul>;}`,
		invalid: ['item*2', 'item.missing'],
		code: 'TS2339',
		token: 'missing'
	},

	{
		name: 'shared native Map snapshot',
		semanticArtifacts: true,
		source:
			'import { peek, type Component } from "@exactjs/core";\ntype Row = { name: string };\nfunction count(rows: readonly Row[]) { return rows.filter(row => row.name !== "").length; }\nexport function Probe(this: Component<{ rows: Map<string, Row> }>, props: { rows: Row[] }) {\n\tthis.state.rows = peek(() => new Map(props.rows.map(row => [row.name, row])));\n\tconst rows = Array.from(this.state.rows.values());\n\tconst total = count(rows);\n\treturn () => <ul aria-label={String(total)}>{rows.map(row => <li key={row.name}>{row.name}</li>)}</ul>;\n}\n',
		invalid: ['count(rows)', 'count(42)'],
		code: 'TS2345',
		token: '42'
	},
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
	},
	{
		name: 'shared Set snapshot',
		semanticArtifacts: true,
		source:
			'type Row={name:string}; function count(rows:readonly Row[]){return rows.length;} export function Probe(props:{rows:Set<Row>}){const rows=Array.from(props.rows.values()); const total=count(rows);return ()=> <ul aria-label={String(total)}>{rows.map(row=><li key={row.name}>{row.name}</li>)}</ul>;}',
		invalid: ['count(rows)', 'count(42)'],
		code: 'TS2345',
		token: '42'
	},
	{
		name: 'shared readonly Map snapshot',
		semanticArtifacts: true,
		source:
			'type Row={name:string}; function count(rows:readonly Row[]){return rows.length;} export function Probe(props:{rows:ReadonlyMap<string,Row>}){const rows=Array.from(props.rows.values()); const total=count(rows);return ()=> <ul aria-label={String(total)}>{rows.map(row=><li key={row.name}>{row.name}</li>)}</ul>;}',
		invalid: ['count(rows)', 'count(42)'],
		code: 'TS2345',
		token: '42'
	},
	{
		name: 'shared array projection',
		semanticArtifacts: true,
		source:
			'type Row={name:string}; function count(rows:readonly Row[]){return rows.length;} export function Probe(props:{rows:string[]}){const rows=props.rows.map(name => ({name})); const total=count(rows);return ()=> <ul aria-label={String(total)}>{rows.map(row=><li key={row.name}>{row.name}</li>)}</ul>;}',
		invalid: ['count(rows)', 'count(42)'],
		code: 'TS2345',
		token: '42'
	},
	{
		name: 'shared array filter',
		semanticArtifacts: true,
		source:
			'type Row={name:string}; function count(rows:readonly Row[]){return rows.length;} export function Probe(props:{rows:Row[]}){const rows=props.rows.filter(row=>row.name!==""); const total=count(rows);return ()=> <ul aria-label={String(total)}>{rows.map(row=><li key={row.name}>{row.name}</li>)}</ul>;}',
		invalid: ['count(rows)', 'count(42)'],
		code: 'TS2345',
		token: '42'
	},
	{
		name: 'shared array slice',
		semanticArtifacts: true,
		source:
			'type Row={name:string}; function count(rows:readonly Row[]){return rows.length;} export function Probe(props:{rows:readonly Row[]}){const rows=props.rows.slice(); const total=count(rows);return ()=> <ul aria-label={String(total)}>{rows.map(row=><li key={row.name}>{row.name}</li>)}</ul>;}',
		invalid: ['count(rows)', 'count(42)'],
		code: 'TS2345',
		token: '42'
	},
	{
		name: 'shared narrowing filter',
		semanticArtifacts: true,
		source: `type Row={name:string}; function count(rows:readonly Row[]){return rows.length;} export function Probe(props:{rows:(Row|{other:number})[]}){const rows=props.rows.filter((row):row is Row=>'name' in row);const total=count(rows);return ()=> <ul aria-label={String(total)}>{rows.map(row=><li key={row.name}>{row.name}</li>)}</ul>;}`,
		invalid: ['count(rows)', 'count(42)'],
		code: 'TS2345',
		token: '42'
	}
] as const;

it.each(examples)('preserves valid $name semantics and rejects an invalid variant', (example) => {
	const { name, source, invalid, code, token } = example;
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
			diagnostics: 'semanticArtifacts' in example ? 'semantic' : 'syntax'
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
		expect(invalidSource.slice(diagnostic.start, diagnostic.start! + diagnostic.length!)).toContain(
			token
		);
	}
});

it('locates a diagnostic after non-ASCII source text', () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const source = `// 😀 café\nexport function Page(){return ()=> <p wrongProp="value"/>;}`;
	const response = compiler.request({
		kind: 'compile',
		id: path.resolve('.tmp/unicode-diagnostic.tsx'),
		source,
		target: 'client'
	});
	const diagnostic = response.diagnostics.find((d) => d.code === 'EXACT_NATIVE_PROP')!;
	expect(diagnostic).toBeDefined();
	expect(source.slice(diagnostic.start, diagnostic.start! + diagnostic.length!)).toContain(
		'wrongProp'
	);
});
