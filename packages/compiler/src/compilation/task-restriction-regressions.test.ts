import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

it('diagnoses equivalent restricted state writes while preserving ordinary receivers', async () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	const forms = {
		'ordinary rebound helper argument':
			'function assign(value:{count:number}){value={count:0};Reflect.set(value,"count",9);}assign(this.state.nested);',

		'ordinary shadow Reflect':
			'const Reflect={set(value:{count:number},key:string,next:number){void value;void key;return next;}};Reflect.set(this.state.nested,"count",9);',
		'ordinary helper object':
			'const value={count:0};const assign=(value:{count:number})=>Reflect.set(value,"count",9);assign(value);',

		'helper method reflect':
			'const helper={assign(value:{count:number}){Reflect.set(value,"count",9);}};helper.assign(this.state.nested);',
		'helper method bound reflect':
			'const helper={assign(this:{count:number}){Reflect.set(this,"count",9);}};helper.assign.call(this.state.nested);',
		'helper receiver for of':
			'function assign(this:{count:number}){for(this.count of [1,2]){}}assign.call(this.state.nested);',
		'helper receiver arrow reflect':
			'function assign(this:{count:number}){const invoke=()=>Reflect.set(this,"count",9);invoke();}assign.apply(this.state.nested);',
		'helper receiver bound reflect':
			'function assign(this:{count:number}){Reflect.set(this,"count",9);}const invoke=assign.bind(this.state.nested);invoke();',
		'helper explicit receiver parameter reflect':
			'function assign(this:void,value:{count:number}){Reflect.set(value,"count",9);}assign.call(undefined,this.state.nested);',
		'ordinary object state loop':
			'const reader={state:{count:0},assign(){for(this.state.count of [1,2]){}}};reader.assign();',
		'ordinary class state reflection':
			'class Reader{state={count:0};assign(){Reflect.set(this.state,"count",9);}}new Reader().assign();',
		'ordinary rest container':
			'function assign(...values:{count:number}[]){Reflect.set(values,"length",0);}assign(this.state.nested);',
		'ordinary nested receiver':
			'function assign(this:{count:number}){function ordinary(this:{count:number}){Reflect.set(this,"count",9);}ordinary.call({count:0});}assign.call(this.state.nested);',
		'helper computed call for of':
			'function assign(value:{count:number}){for(value.count of [1,2]){}}assign["call"](undefined,this.state.nested);',
		'helper computed bound reflect':
			'function assign(value:{count:number}){Reflect.set(value,"count",9);}const invoke=assign["bind"](undefined,this.state.nested);invoke();',
		'reflect fully bound target':
			'const invoke=Reflect.set.bind(Reflect,this.state.nested,"count",9);invoke();',
		'reflect computed fully bound target':
			'const invoke=Reflect.set["bind"](Reflect,this.state.nested,"count",9);invoke();',
		'reflect computed call': 'Reflect.set["call"](Reflect,this.state.nested,"count",9);',
		'reflect computed apply': 'Reflect.set["apply"](Reflect,[this.state.nested,"count",9]);',
		'helper call for of':
			'function assign(value:{count:number}){for(value.count of [1,2]){}}assign.call(undefined,this.state.nested);',
		'helper apply reflect':
			'function assign(value:{count:number}){Reflect.set(value,"count",9);}assign.apply(undefined,[this.state.nested]);',
		'helper bound prefix reflect':
			'function assign(value:{count:number},next:number){Reflect.set(value,"count",next);}const invoke=assign.bind(undefined,this.state.nested);invoke(9);',
		'helper immutable alias reflect':
			'function assign(value:{count:number}){Reflect.set(value,"count",9);}const invoke=assign;invoke(this.state.nested);',
		'reflect bound target':
			'const assign=Reflect.set.bind(Reflect,this.state.nested);assign("count",9);',
		'reflect rebound target':
			'const assign=Reflect.set.bind(Reflect,this.state.nested);const invoke=assign.bind(undefined,"count");invoke(9);',
		'ordinary custom call':
			'const assign={call(value:{count:number}){void value;}};assign.call(this.state.nested);',
		'direct for of': 'for(this.state.count of [1,2]){}',
		'aliased for of': 'const state=this.state;for(state.count of [1,2]){}',
		'destructured for of': 'for([this.state.count] of [[1],[2]]){}',
		'closure for of': 'const invoke=()=>{for(this.state.count of [1,2]){}};invoke();',
		'helper for of':
			'function assign(value:{count:number}){for(value.count of [1,2]){}}assign(this.state.nested);',
		'direct for in': 'for(this.state.key in {a:1,b:2}){}',
		'reflect call': 'Reflect.set.call(Reflect,this.state.nested,"count",9);',
		'reflect apply': 'Reflect.set.apply(Reflect,[this.state.nested,"count",9]);',
		'reflect bound alias':
			'const assign=Reflect.set.bind(Reflect);assign(this.state.nested,"count",9);',
		'computed constant reflect': 'const method="set";Reflect[method](this.state.nested,"count",9);',
		'destructured reflect': 'const {set}=Reflect;set(this.state.nested,"count",9);',
		'destructured bound reflect':
			'const {set}=Reflect;const invoke=set.bind(Reflect);invoke(this.state.nested,"count",9);',
		'destructured computed reflect':
			'const {["set"]:set}=Reflect;set(this.state.nested,"count",9);',
		'destructured object define':
			'const {defineProperty}=Object;defineProperty(this.state.nested,"count",{value:9});',
		'wrapped destructured reflect':
			'const {set}=Reflect;(set as typeof Reflect.set)(this.state.nested,"count",9);',
		'ordinary destructured reflect': 'const {set}=Reflect;set({count:0},"count",9);',
		'ordinary destructured shadow':
			'const Reflect={set(value:unknown,key:string,next:number){return next;}};const {set}=Reflect;set(this.state.nested,"count",9);',
		'direct reflect': 'Reflect.set(this.state.nested,"count",9);',
		'aliased reflect': 'const reflect=Reflect;reflect.set(this.state.nested,"count",9);',
		'extracted reflect': 'const assign=Reflect.set;assign(this.state.nested,"count",9);',
		'computed reflect': 'Reflect["set"](this.state.nested,"count",9);',
		'helper reflect':
			'const assign=(value:{count:number})=>Reflect.set(value,"count",9);assign(this.state.nested);',
		'direct define': 'Object.defineProperty(this.state.nested,"count",{value:9});',
		'aliased define':
			'const define=Object.defineProperty;define(this.state.nested,"count",{value:9});',
		'helper chain reflect':
			'const leaf=(value:{count:number})=>Reflect.set(value,"count",9);const assign=(value:{count:number})=>leaf(value);assign(this.state.nested);',
		'receiver call':
			'function assign(this:{count:number}){this.count=9;}assign.call(this.state.nested);',
		'receiver apply':
			'function assign(this:{count:number}){this.count=9;}assign.apply(this.state.nested);',
		'receiver bind':
			'function assign(this:{count:number}){this.count=9;}assign.bind(this.state.nested)();'
	};

	for (const [name, work] of Object.entries(forms))
		for (const target of ['default', 'client', 'server'] as const) {
			const source = `import {TaskContext,type Component} from '@exactjs/core'; export function Probe(this:Component<{count:number;key:string;nested:{count:number}}>){this.state.count=0;this.state.key='';this.state.nested={count:0};const run=(task:TaskContext=TaskContext.${target === 'server' ? 'server' : 'client'}().latest().blocking())=>{${work}};return ()=> <button onClick={()=>run()}>{this.state.count}</button>;}`;
			const response = compiler.request({
				kind: target === 'default' ? 'check' : 'compile',
				target,
				id: path.resolve(
					'.tmp/task-restriction-regressions/' + name.replaceAll(' ', '-') + '/' + target + '.tsx'
				),
				source,
				root: process.cwd(),
				diagnostics: 'semantic'
			});
			expect(response.error).toBeUndefined();
			if (name.startsWith('receiver ') || name.startsWith('ordinary ')) {
				expect(response.diagnostics).toEqual([]);
			} else {
				const diagnostic = response.diagnostics.find((d) => d.code === 'EXACT_STATE_WRITE');
				expect(diagnostic, name + ':' + target).toBeDefined();
				expect(diagnostic!.length).toBeGreaterThan(0);
			}
		}
}, 30_000);
