import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { expect, it, onTestFinished } from 'vitest';
import { ExactCompilerSession } from '../expression/project.js';
import { createTestWorkspace, createCompilerTestWorkspace } from '../test-support/workspace.js';
import { assertOrdinaryModuleNamespaces } from '../test-support/module-namespace.js';

const browser = `{get value(){return document.title}}`;
const aliases = ['const', 'let', 'var'].flatMap((kind) =>
	[
		['sibling', '', ''],
		['direct after', '', `input=${browser};`],
		['unrelated call', 'function noop(){}noop();', ''],
		['unrelated assignment', 'let count=0;count++;', '']
	].map(([name, before, after]) => ({
		name: `${kind} ${name}`,
		source: `function make(input:{value:string}){${before}${kind} old=input;${after}return {get value(){return old.value},replace(next:{value:string}){input=next}}}const box=make({value:'safe'});box.replace(${browser});export const value=box.value;`,
		browser: false
	}))
);

// Placement alone could accept an omitted portable export. Execute the typed output in both
// targets to protect alias identity and the server partition independently of helper spelling.
it.each([
	...aliases,
	{
		name: 'scalar module acquisition before producer',
		source: `let input="safe";const old=input;input=document.title;export const value=old;`,
		browser: false
	},
	{
		name: 'taken logical module producer',
		source: `const obj={value:""};obj.value||=document.title;export const value=obj.value;`,
		browser: true
	},
	{
		name: 'skipped logical module producer',
		source: `const obj={value:"safe"};obj.value||=document.title;export const value=obj.value;`,
		browser: false
	},
	{
		name: 'performed binding',
		source: `let input="safe";input=document.title;export const value=input;`,
		browser: true
	},
	{
		name: 'performed property',
		source: `const input={value:"safe"};input.value=document.title;export const value=input.value;`,
		browser: true
	},
	{
		name: 'performed indexed slot',
		source: `const input=["safe"];input[0]=document.title;export const value=input[0];`,
		browser: true
	},
	{
		name: 'performed getter capture',
		source: `const input={value:"safe"};input.value=document.title;const obj={get value(){return input.value}};export const value=obj.value;`,
		browser: true
	},
	{
		name: 'performed ordinary call capture',
		source: `const input={value:"safe"};input.value=document.title;function read(){return input.value}export const value=read();`,
		browser: true
	},
	{
		name: 'performed projected call capture',
		source: `function make(input:{value:string}){return ()=>input.value}const input={value:"safe"};const xs=[make(input)];input.value=document.title;export const value=xs[0]!();`,
		browser: true
	},
	{
		name: 'performed called writer',
		source: `const input={value:"safe"};function write(){input.value=document.title}write();export const value=input.value;`,
		browser: true
	},
	{
		name: 'performed called binding writer',
		source: `let input="safe";function write(){input=document.title}write();export const value=input;`,
		browser: true
	},
	{
		name: 'dormant module writer',
		source: `const obj={item:{value:"safe"}};function write(){obj.item={get value(){return document.title}}}export const value=obj.item.value;`,
		browser: false
	},
	{
		name: 'dormant object writer',
		source: `const obj={item:{value:"safe"},write(){obj.item={get value(){return document.title}}}};export const value=obj.item.value;`,
		browser: false
	},
	{
		name: 'later module writer',
		source: `const input={value:"safe"};export const value=input.value;input.value=document.title;`,
		browser: false
	},
	{
		name: 'safe module replacement',
		source: `const obj={item:{get value(){return document.title}}};obj.item={value:"safe"};export const value=obj.item.value;`,
		browser: false
	},
	{
		name: 'safe module root replacement',
		source: `let obj={get value(){return document.title}};obj={value:"safe"};export const value=obj.value;`,
		browser: false
	},
	{
		name: 'mutated acquired origin',
		source: `const obj={item:{value:"safe"}};const old=obj.item;obj.item={value:"other"};old.value=document.title;export const value=old.value;`,
		browser: true
	},
	{
		name: 'unused forwarded native vector',
		source: `function noop(input:unknown){return "safe"}function read(input:{value:string}={get value(){return document.title}}){return noop(input)}const args={length:1,0:{value:"safe"}};read.apply(undefined,args as unknown as [{value:string}]);export const value="safe";`,
		browser: false
	},
	{
		name: 'native empty apply default',
		source: `function read(input:{value:string}={get value(){return document.title}}){return input.value}export const value=read.apply(undefined,[]);`,
		browser: true
	},
	{
		name: 'rest prefix before spread',
		source: `function make(){return (...inputs:{value:string}[])=>inputs[0]!.value}const args=[{get value(){return document.title}}];const xs=[make()];export const value=xs[0]!({value:"safe"},...args);`,
		browser: false
	},
	{
		name: 'ordinary destructured input',
		source: `function read({value}:{value:string}){return value}read({value:"safe"});export const value="safe";`,
		browser: false
	},
	{
		name: 'ordinary unused spread rest',
		source: `function noop(...values:unknown[]){return "safe"}noop(...[]);export const value="safe";`,
		browser: false
	},
	{
		name: 'rest argument alternatives retain position',
		source: `function make(){return (...inputs:{value:string}[])=>inputs[1]!.value}let input={value:"safe"};input={get value(){return document.title}};const xs=[make()];export const value=xs[0]!(input,{value:"safe"});`,
		browser: false
	},
	{
		name: 'projected invocation preserves native apply wrapper',
		source: `const xs=[{get value(){return document.title}}];const native=xs.slice;xs.slice=function(this:{value:string}[],...args:[start?:number,end?:number]){return native.apply(this,args)};xs.slice();export const value=xs[0]!.value;`,
		browser: true
	},
	{
		name: 'projected invocation array',
		source: `function make(input:{value:string}){return function read(){return input.value}}const xs=[make({get value(){return document.title}})];export const value=xs[0]!();`,
		browser: true
	},
	{
		name: 'projected invocation array-safe',
		source: `function make(input:{value:string}){return function read(){return input.value}}const xs=[make({value:"safe"})];export const value=xs[0]!();`,
		browser: false
	},
	{
		name: 'projected invocation object',
		source: `function make(input:{value:string}){return function read(){return input.value}}const xs={read:make({get value(){return document.title}})};export const value=xs.read();`,
		browser: true
	},
	{
		name: 'projected invocation nested',
		source: `function make(input:{value:string}){return function read(){return input.value}}const xs={inner:[make({get value(){return document.title}})]};export const value=xs.inner[0]!();`,
		browser: true
	},
	{
		name: 'projected invocation arguments',
		source: `function make(){return function read(input:{value:string}){return input.value}}const xs=[make()];export const value=xs[0]!({get value(){return document.title}});`,
		browser: true
	},
	{
		name: 'projected invocation default',
		source: `function make(input:{value:string}){return function read(value=input){return value.value}}const xs=[make({get value(){return document.title}})];export const value=xs[0]!();`,
		browser: true
	},
	{
		name: 'projected invocation undefined-default',
		source: `function make(input:{value:string}){return function read(value=input){return value.value}}const xs=[make({get value(){return document.title}})];export const value=xs[0]!(undefined);`,
		browser: true
	},
	{
		name: 'projected invocation rest',
		source: `function make(){return function read(...inputs:{value:string}[]){return inputs[1]!.value}}const xs=[make()];export const value=xs[0]!({value:"safe"},{get value(){return document.title}});`,
		browser: true
	},
	{
		name: 'projected invocation method-this',
		source: `function make(){return function read(this:{value:string}){return this.value}}const xs={read:make(),get value(){return document.title}};export const value=xs.read();`,
		browser: true
	},
	{
		name: 'projected invocation arrow-this',
		source: `function make(this:{value:string}){return ()=>this.value}const obj={make,get value(){return document.title}};const xs={read:obj.make(),value:"safe"};export const value=xs.read();`,
		browser: true
	},
	{
		name: 'projected invocation optional',
		source: `function make(input:{value:string}){return function read(){return input.value}}const xs=[make({get value(){return document.title}})];export const value=xs[0]?.();`,
		browser: true
	},
	{
		name: 'projected invocation acquired-browser',
		source: `function make(input:{value:string}){return function read(){return input.value}}const xs=[make({get value(){return document.title}})];const old=xs[0]!;xs[0]=make({value:"safe"});export const value=old();`,
		browser: true
	},
	{
		name: 'projected invocation acquired-safe',
		source: `function make(input:{value:string}){return function read(){return input.value}}const xs=[make({value:"safe"})];const old=xs[0]!;xs[0]=make({get value(){return document.title}});export const value=old();`,
		browser: false
	},
	{
		name: 'overloaded authored receiver noop',
		source: `const xs=[{get value(){return document.title}}];function noop(this:{value:string}[]):{value:string}[];function noop(this:{value:string}[],unused?:number){return this}xs.reverse=noop;xs.reverse();export const value=xs[0]!.value;`,
		browser: true
	},
	{
		name: 'getter and setter call order',
		extras: { order: 'get,set' },
		source: `const log:string[]=[];const xs={get item(){log.push("get");return {value:"safe"}},set item(v:{value:string}){log.push("set")}};const old=xs.item;xs.item={value:"other"};export const value=old.value;export const order=log.join(",");`,
		browser: false
	},
	{
		name: 'raw-own-noop',
		source: `const xs=[{get value(){return document.title}}];xs.push=()=>1;xs.push();export const value=xs[0]!.value;`,
		browser: true
	},
	{
		name: 'raw-later-call',
		source: `const xs=[{get value(){return document.title}}];export const value=xs[0]!.value;xs.slice();`,
		browser: true
	},
	{
		name: 'raw-other-slot-call',
		source: `const xs=[{get value(){return document.title}},{value:"safe",noop(){}}];xs[1]!.value.toString();export const value=xs[0]!.value;`,
		browser: true
	},
	{
		name: 'acquire-object-safe',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs={item:make({value:"safe"})};const old=xs.item;xs.item=make({get value(){return document.title}});export const value=old.value;`,
		browser: false
	},
	{
		name: 'acquire-old-mutation',
		source: `const xs={item:{inner:{value:"safe"}}};const old=xs.item;xs.item={inner:{value:"safe"}};old.inner={get value(){return document.title}};export const value=old.inner.value;`,
		browser: true
	},
	{
		name: 'acquire-prefix-replacement',
		source: `const xs={nested:{item:{inner:{value:"safe"}}}};const old=xs.nested.item;xs.nested={item:{inner:{get value(){return document.title}}}};export const value=old.inner.value;`,
		browser: false
	},
	{
		name: 'browser-replaced-before',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs={item:make({get value(){return document.title}})};xs.item=make({value:"safe"});const old=xs.item;export const value=old.value;`,
		browser: false
	},
	{
		name: 'raw-slice',
		source: `const xs=[{get value(){return document.title}}];xs.slice();export const value=xs[0]!.value;`,
		browser: true
	},
	{
		name: 'acquire-browser',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({get value(){return document.title}})];const old=xs[0]!;xs[0]=make({value:"safe"});export const value=old.value;`,
		browser: true
	},
	{
		name: 'object-acquire-browser',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs={item:make({get value(){return document.title}})};const old=xs.item;xs.item=make({value:"safe"});export const value=old.value;`,
		browser: true
	},
	{
		name: 'array literal',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({get value(){return document.title}})];export const value=xs[0]!.value;`,
		browser: true
	},
	{
		name: 'array sparse',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[,make({get value(){return document.title}})];export const value=xs[1]!.value;`,
		browser: true
	},
	{
		name: 'array hole',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[,make({get value(){return document.title}})];export const value=xs[0]?.value??"safe";`,
		browser: false
	},
	{
		name: 'array numeric-string',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({get value(){return document.title}})];export const value=xs["0"]!.value;`,
		browser: true
	},
	{
		name: 'array named-key',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({get value(){return document.title}})];export const value=(xs as typeof xs & {"01"?:{value:string}})["01"]?.value??"safe";`,
		browser: false
	},
	{
		name: 'array indexed',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs:{value:string}[]=[];xs[0]=make({get value(){return document.title}});export const value=xs[0]!.value;`,
		browser: true
	},
	{
		name: 'array alias-write',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs:{value:string}[]=[];const alias=xs;alias[0]=make({get value(){return document.title}});export const value=xs[0]!.value;`,
		browser: true
	},
	{
		name: 'array nested',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[[{item:make({get value(){return document.title}})}]];export const value=xs[0]![0]!.item.value;`,
		browser: true
	},
	{
		name: 'array nested-write',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs:{value:string}[][]=[[]];xs[0]![0]=make({get value(){return document.title}});export const value=xs[0]![0]!.value;`,
		browser: true
	},
	{
		name: 'array safe',
		source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({value:"safe"})];export const value=xs[0]!.value;`,
		browser: false
	},
	{
		name: 'array plain',
		source: `function make(input:{value:string}){return {value:"safe"}}const xs=[make({get value(){return document.title}})];export const value=xs[0]!.value;`,
		browser: false
	},
	{
		name: 'alias chain after replacement',
		source: `function make(input:{value:string}){let first=input;input=${browser};var old=first;return {get value(){return old.value}}}export const value=make({value:'safe'}).value;`,
		browser: false
	},
	{
		name: 'local alias rebinding',
		source: `function make(input:{value:string}){let old=input;old=${browser};return {get value(){return old.value}}}export const value=make({value:'safe'}).value;`,
		browser: true
	},
	{
		name: 'unrelated local writes',
		source: `function make(input:{value:string}){let count=0;count++;const other={n:0};other.n=1;return {get value(){return input.value}}}export const value=make(${browser}).value;`,
		browser: true
	}
])('preserves ordinary closure semantics for $name', assertOrdinaryModuleNamespaces);

// Unknown placement must retain portable values, including the complete module namespace.
it.each([
	{
		name: 'native unknown apply vector default',
		source: `function read(input:{value:string}={get value(){return document.title}}){return input.value}const args={length:1,0:{value:"safe"}};export const value=read.apply(undefined,args as unknown as [{value:string}]);`
	},
	{
		name: 'argument after spread',
		source: `function make(){return (first:{value:string},second:{value:string},...rest:{value:string}[])=>second.value}const args:[{value:string},{value:string}]=[{value:"safe"},{value:"safe"}];const xs=[make()];export const value=xs[0]!(...args,{get value(){return document.title}});`
	},
	{
		name: 'expression receiver alternative',
		source:
			'const xs=[{get value(){return document.title}},{value:"safe"}];const native=xs.reverse;let alias=native;xs.reverse=Number("1")?(Number("0"),alias=native):function(this:{value:string}[]){return this};xs.reverse();export const value=xs[0]!.value;'
	},
	{
		name: 'mixed-reverse-safe',
		source:
			'const xs:{value:string}[]=[{get value(){return document.title}},{value:"safe"}];const native=xs.reverse;xs.reverse=Number("1")?native:function(this:{value:string}[]){return this};xs.reverse();export const value=xs[0]!.value;'
	},
	{
		name: 'mixed-fill-safe',
		source:
			'const xs:{value:string}[]=[{get value(){return document.title}}];const native=xs.fill;xs.fill=Number("1")?native:function(this:{value:string}[]){return this};xs.fill({value:"safe"});export const value=xs[0]!.value;'
	},
	{
		name: 'relevant-safe',
		source:
			'const xs=[{get value(){return document.title}}];xs.reverse=function(this:{value:string}[]){xs[0]={value:"safe"};return this};xs.reverse();export const value=xs[0]!.value;'
	},
	{
		name: 'acquired-writer',
		source:
			'const xs=[{inner:{get value(){return document.title}}}];const old=xs[0]!;xs.reverse=function(this:{inner:{value:string}}[]){old.inner={value:"safe"};return this};xs.reverse();export const value=old.inner.value;'
	}
])('retains portable receiver alternatives for $name', async (test) => {
	const root = await createCompilerTestWorkspace('.exact-receiver-alternatives-', process.cwd());
	const session = new ExactCompilerSession();
	onTestFinished(() => session.dispose());
	const source = test.source + `export const stable='safe';`;
	for (const target of ['client', 'server'] as const) {
		const compiled = session.compileNative({
			kind: 'compile',
			id: path.join(root, 'entry.ts'),
			source,
			target,
			diagnostics: 'semantic'
		});
		expect(compiled.error).toBeUndefined();
		expect(compiled.diagnostics).toEqual([]);
		expect(compiled.analysis?.exports.find((value) => value.name === 'value')?.placement).toBe(
			'unknown'
		);
		const filename = path.join(root, target + '.mts');
		await writeFile(filename, compiled.code!);
		const result = spawnSync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				(target === 'client' ? 'globalThis.document={title:"browser"};' : '') +
					`console.log(JSON.stringify(await import(${JSON.stringify(pathToFileURL(filename).href)})));`
			],
			{ encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({ stable: 'safe', value: 'safe' });
	}
});

// Acquired source implementations own branch facts even when a callable variable
// is declared in an ambient library. Both targets retain portable exports.
it.each([
	{
		name: 'retained-shadowed-number',
		source:
			'const Number=(input:string)=>0;const obj={item:{value:"safe"}};if(Number("1"))obj.item={get value(){return document.title}};export const value=obj.item.value;',
		browser: false
	},
	{
		name: 'retained-overridden-number',
		source:
			'Number=(()=>0) as NumberConstructor;const obj={item:{value:"safe"}};if(Number("1"))obj.item={get value(){return document.title}};export const value=obj.item.value;',
		browser: false
	},
	{
		name: 'retained-global-number',
		source:
			'globalThis.Number=(()=>0) as NumberConstructor;const obj={item:{value:"safe"}};if(Number("1"))obj.item={get value(){return document.title}};export const value=obj.item.value;',
		browser: false
	}
] satisfies (Parameters<typeof assertOrdinaryModuleNamespaces>[0] & { name: string })[])(
	'retains assigned source module exports for $name',
	assertOrdinaryModuleNamespaces
);

// A possible browser write cannot remove a portable export without a performed producer.
// Full namespaces and argument/coercion effects remain observable in both target artifacts.
it.each([
	{
		name: 'retained-number-effect-input',
		source:
			'let effects="";const obj={item:{value:"safe"}};if(Number((effects+="call","0")))obj.item={get value(){return document.title}};export const value=obj.item.value;export {effects};',
		browser: false,
		placement: 'unknown',
		extras: { effects: 'call' }
	},
	{
		name: 'retained-number-object-input',
		source:
			'let effects="";const obj={item:{value:"safe"}};if(Number({valueOf(){effects+="value";return 0}}))obj.item={get value(){return document.title}};export const value=obj.item.value;export {effects};',
		browser: false,
		placement: 'unknown',
		extras: { effects: 'value' }
	}
] satisfies (Parameters<typeof assertOrdinaryModuleNamespaces>[0] & { name: string })[])(
	'retains possible producer inputs and effects for $name',
	assertOrdinaryModuleNamespaces
);

// The actual imported JavaScript source owns conversion effects. Unknown descriptive
// placement must preserve its portable result and authored exports in both targets.
it('retains the original foreign numeric-conversion safe namespace', async () => {
	const root = await createTestWorkspace('.exact-foreign-number-', process.cwd());
	const session = new ExactCompilerSession();
	onTestFinished(() => session.dispose());
	const configFile = path.join(root, 'tsconfig.json');
	await writeFile(
		configFile,
		'{"compilerOptions": {"target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "strict": true, "skipLibCheck": true, "allowJs": true, "checkJs": false}, "files": ["entry.ts"]}'
	);
	await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
	const source =
		'import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{get value(){return document.title}}};if(Number("1"))return obj;obj.item={value:"safe"};return obj}export const value=make().item.value;export const stable="safe";';
	const helper = 'export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};';
	await writeFile(path.join(root, 'entry.ts'), source);
	await writeFile(path.join(root, 'helper.js'), helper);
	const synchronized = session.compileNative({
		kind: 'synchronize',
		root: process.cwd(),
		configFile,
		diagnostics: 'semantic',
		sources: [
			{ id: path.join(root, 'entry.ts'), source },
			{ id: path.join(root, 'helper.js'), source: helper }
		]
	});
	expect(synchronized.error).toBeUndefined();
	expect(synchronized.diagnostics).toEqual([]);
	for (const target of ['client', 'server'] as const) {
		const compiled = session.compileNative({
			kind: 'compile',
			id: path.join(root, 'entry.ts'),
			source,
			target,
			root: process.cwd(),
			configFile,
			diagnostics: 'semantic'
		});
		expect(compiled.error).toBeUndefined();
		expect(compiled.diagnostics).toEqual([]);
		expect(compiled.analysis?.exports.find((value) => value.name === 'value')?.placement).toBe(
			'unknown'
		);
		const filename = path.join(root, target + '.mts');
		await writeFile(filename, compiled.code!);
		const result = spawnSync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				(target === 'client' ? 'globalThis.document={title:"browser"};' : '') +
					`console.log(JSON.stringify(await import(${JSON.stringify(pathToFileURL(filename).href)})));`
			],
			{ encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({ stable: 'safe', value: 'safe' });
	}
});
