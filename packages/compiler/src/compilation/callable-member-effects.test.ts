import ts from 'typescript';
import { expect, it, onTestFinished } from 'vitest';
import path from 'node:path';
import { ExactCompilerSession } from '../expression/project.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

interface CallableExecutionWitness {
	name: string;
	source: string;
	target: 'client' | 'server';
	calls: string[];
	expected: {
		exports: Record<string, unknown>;
		returns: unknown[];
		hostTrace: string[];
		readCounts: number[];
	};
}

// Operations retain body deferral, selected-callee order and raw/adapted inputs.
// Explicit host objects measure ordinary unit execution. Unknown placement here
// supplies no browser, server integration, adapter or publication authority.
const witnesses: CallableExecutionWitness[] = [
	{
		name: 'browser-property-body',
		source:
			'function f(){return 0} f.run=()=>0; const box={m:f}; const saved=box.m; saved.run=()=>document.title.length; export function probe(){return saved.run()}\n',
		target: 'client',
		calls: ['probe'],
		expected: {
			exports: {},
			returns: [7],
			hostTrace: ['document.title:get'],
			readCounts: [0, 1]
		}
	},
	{
		name: 'server-property-body',
		source:
			'function f(){return 0} f.run=()=>0; const box={m:f}; const saved=box.m; saved.run=()=>process.pid; export function probe(){return saved.run()}\n',
		target: 'server',
		calls: ['probe'],
		expected: {
			exports: {},
			returns: [313],
			hostTrace: ['process.pid:get'],
			readCounts: [0, 1]
		}
	},
	{
		name: 'direct-function',
		source:
			'function f(){return 0} f.run=()=>document.title.length; const box={m:f}; const saved=box.m; export const value=saved();',
		target: 'client',
		calls: [],
		expected: {
			exports: {
				value: 0
			},
			returns: [],
			hostTrace: [],
			readCounts: [0]
		}
	},
	{
		name: 'read-without-invocation',
		source:
			'const f=()=>0; f.run=()=>document.title.length; const box={m:f}; const saved=box.m; export const value=typeof saved.run;',
		target: 'client',
		calls: [],
		expected: {
			exports: {
				value: 'function'
			},
			returns: [],
			hostTrace: [],
			readCounts: [0]
		}
	},
	{
		name: 'saved-callee-preargument',
		source:
			'function f(){return 0} f.run=(_n=0)=>1; const box={m:f}; const saved=box.m; const selected=saved.run; saved.run=()=>document.title.length; export const first=selected(); export const value=saved.run((saved.run=()=>3,0));',
		target: 'client',
		calls: [],
		expected: {
			exports: {
				first: 1,
				value: 7
			},
			returns: [],
			hostTrace: ['document.title:get'],
			readCounts: [1]
		}
	},
	{
		name: 'computed-key-before-get',
		source:
			'function f(){return 0} f.run=(_n=0)=>1; const box={m:f}; const saved=box.m; const selected=saved.run; saved.run=()=>document.title.length; export const first=selected(); export const value=saved[(saved.run=()=>3,"run")](0);',
		target: 'client',
		calls: [],
		expected: {
			exports: {
				first: 1,
				value: 3
			},
			returns: [],
			hostTrace: [],
			readCounts: [0]
		}
	},
	{
		name: 'source-method-receiver-destructuring-default',
		source:
			'function f(){return 0}f.run=function(this:Function,{value}:{value:string}={get value(){return document.title}}){return {bound:this===f,value}};export function supplied(){return f.run({value:"explicit"})}export function defaulted(){return f.run()}\n',
		target: 'client',
		calls: ['supplied', 'defaulted'],
		expected: {
			exports: {},
			returns: [
				{
					bound: true,
					value: 'explicit'
				},
				{
					bound: true,
					value: 'browser'
				}
			],
			hostTrace: ['document.title:get'],
			readCounts: [0, 0, 1]
		}
	},
	{
		name: 'source-apply-raw-provided',
		source:
			'function f(){return "native"} f.apply=function<T,A extends unknown[],R>(this:(this:T,...args:A)=>R,receiver:T=({get value(){return document.title}} as T),_args?:A):R{return (receiver as {value:string}).value as R};export function probe(){return f.apply({value:"safe"})}\n',
		target: 'client',
		calls: ['probe'],
		expected: {
			exports: {},
			returns: ['safe'],
			hostTrace: [],
			readCounts: [0, 0]
		}
	},
	{
		name: 'source-apply-raw-default',
		source:
			'function f(){return "native"} f.apply=function<T,A extends unknown[],R>(this:(this:T,...args:A)=>R,receiver:T=({get value(){return document.title}} as T),_args?:A):R{return (receiver as {value:string}).value as R};export function probe(){return f.apply(undefined)}\n',
		target: 'client',
		calls: ['probe'],
		expected: {
			exports: {},
			returns: ['browser'],
			hostTrace: ['document.title:get'],
			readCounts: [0, 1]
		}
	},
	{
		name: 'native-apply-default-receiver',
		source:
			'function read(this:{prefix:string},{value}:{value:string}={get value(){return document.title}}){return this.prefix+value}export const result=read.apply({prefix:"d:"});\n',
		target: 'client',
		calls: [],
		expected: {
			exports: {
				result: 'd:browser'
			},
			returns: [],
			hostTrace: ['document.title:get'],
			readCounts: [1]
		}
	},
	{
		name: 'computed-method-valid',
		source:
			'function f() {}\nf.run = () => 0\nfunction patch(): string { Object.defineProperty(f, "run", { get() { return document.title } }); return "key" }\nconst unused = { [patch()]() {} }\nexport const value = typeof f.run\n',
		target: 'client',
		calls: [],
		expected: {
			exports: {
				value: 'string'
			},
			returns: [],
			hostTrace: ['document.title:get'],
			readCounts: [1]
		}
	},
	{
		name: 'computed-getter-valid',
		source:
			'function f() {}\nf.run = () => 0\nfunction patch(): string { Object.defineProperty(f, "run", { get() { return document.title } }); return "key" }\nconst unused = { get [patch()]() { return 0 } }\nexport const value = typeof f.run\n',
		target: 'client',
		calls: [],
		expected: {
			exports: {
				value: 'string'
			},
			returns: [],
			hostTrace: ['document.title:get'],
			readCounts: [1]
		}
	},
	{
		name: 'computed-setter-valid',
		source:
			'function f(){} f.run=()=>0; function patch():string { Object.defineProperty(f,"run",{get(){return document.title}}); return "key" } const unused={set [patch()](value:number){}}; export const value=typeof f.run;',
		target: 'client',
		calls: [],
		expected: {
			exports: {
				value: 'string'
			},
			returns: [],
			hostTrace: ['document.title:get'],
			readCounts: [1]
		}
	},
	{
		name: 'nested-reached-name',
		source:
			'function f(){} f.run=()=>0; function patch():string { Object.defineProperty(f,"run",{get(){return document.title}}); return "key" } function make(){return {[patch()](){}}} make(); export const value=typeof f.run;',
		target: 'client',
		calls: [],
		expected: {
			exports: {
				value: 'string'
			},
			returns: [],
			hostTrace: ['document.title:get'],
			readCounts: [1]
		}
	},
	{
		name: 'nested-deferred-name',
		source:
			'function f(){} f.run=()=>0; function patch():string { Object.defineProperty(f,"run",{get(){return document.title}}); return "key" } function make(){return {set [patch()](value:number){}}} export const value=typeof f.run;',
		target: 'client',
		calls: [],
		expected: {
			exports: {
				value: 'function'
			},
			returns: [],
			hostTrace: [],
			readCounts: [0]
		}
	},
	{
		name: 'ordinary-native-apply-default',
		source:
			"function read(input:{value:string}={get value(){return document.title}}){return input.value}export const value=read.apply(undefined);export const stable='stable';",
		target: 'client',
		calls: [],
		expected: {
			exports: {
				value: 'browser',
				stable: 'stable'
			},
			returns: [],
			hostTrace: ['document.title:get'],
			readCounts: [1]
		}
	},
	{
		name: 'captured-reference-and-property-operation',
		source:
			'function source(){return 0}\nsource.run=()=>0;\nconst box={member:source};\nconst saved=box.member;\nsaved.run=()=>document.title.length;\nexport function inspect(){return saved()+":"+typeof saved.run}\nexport function selectedProbe(){return saved.run()}\n',
		target: 'client',
		calls: ['inspect', 'selectedProbe'],
		expected: {
			exports: {},
			returns: ['0:function', 7],
			hostTrace: ['document.title:get'],
			readCounts: [0, 0, 1]
		}
	},
	{
		name: 'original-native-wrapper',
		source:
			'const xs=[{get value(){return document.title}}];const native=xs.slice;xs.slice=function(this:{value:string}[],...args:[start?:number,end?:number]){return native.apply(this,args)};xs.slice();export const value=xs[0]!.value;',
		target: 'client',
		calls: [],
		expected: {
			exports: {
				value: 'browser'
			},
			returns: [],
			hostTrace: ['document.title:get'],
			readCounts: [1]
		}
	}
];

it.each(witnesses)('preserves callable property execution: $name', async (test) => {
	const root = await createTestWorkspace('.exact-callable-member-', process.cwd());
	await writeTestFiles(root, {
		'tsconfig.json': JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				strict: true,
				types: ['node'],
				lib: ['ES2022', 'DOM'],
				noEmit: true
			}
		})
	});
	const session = new ExactCompilerSession();
	onTestFinished(() => session.dispose());
	const compiled = session.compileNative({
		kind: 'compile',
		root,
		configFile: path.join(root, 'tsconfig.json'),
		id: path.join(root, 'entry.ts'),
		source: test.source,
		target: test.target,
		diagnostics: 'semantic'
	});
	expect(compiled.error).toBeUndefined();
	expect(compiled.diagnostics).toEqual([]);
	const javascript = ts.transpileModule(compiled.code!, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	}).outputText;
	const hostTrace: string[] = [];
	const documentHost = {
		get title() {
			hostTrace.push('document.title:get');
			return 'browser';
		}
	};
	const processHost = {
		get pid() {
			hostTrace.push('process.pid:get');
			return 313;
		}
	};
	const module = { exports: {} as Record<string, unknown> };
	new Function('require', 'exports', 'module', 'document', 'process', javascript)(
		(specifier: string) => {
			throw new Error(`Unexpected unit dependency ${specifier}`);
		},
		module.exports,
		module,
		documentHost,
		processHost
	);
	const exports: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(module.exports))
		if (typeof value !== 'function') exports[name] = value;
	const readCounts = [hostTrace.length];
	const returns: unknown[] = [];
	for (const name of test.calls) {
		const callable = module.exports[name];
		expect(callable).toBeTypeOf('function');
		returns.push((callable as () => unknown)());
		readCounts.push(hostTrace.length);
	}
	expect({ exports, returns, hostTrace, readCounts }).toEqual(test.expected);
});
