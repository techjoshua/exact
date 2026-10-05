import { taskEvaluationRegressionCases } from './task-evaluation-regression-cases.js';
import { taskOptionalRegressionCases } from './task-optional-regression-cases.js';
import type { TaskStateRegressionCase } from './task-state-regression-contract.js';

/** Authored state programs shared by client publication and direct SSR regression checks. */
export const taskStateRegressionCases: TaskStateRegressionCase[] = [
	...taskEvaluationRegressionCases,
	...taskOptionalRegressionCases,
	{
		name: 'native date readers preserve their receiver brand',
		extraState: 'when?:Date;',
		work: 'this.state.lookup.set("x",9);this.state.when=new Date(9);this.state.trace=String(this.state.when.getTime());',
		expected: '9'
	},
	{
		name: 'primitive state member calls retain native receivers',
		work: 'this.state.lookup.set("x",9);this.state.count=9;this.state.trace=this.state.count.toString();',
		expected: '9'
	},
	{
		name: 'union state member calls retain primitive receivers',
		work: 'this.state.lookup.set("x",9);this.state.count=9;const value=this.state.count as number|{toString():string};this.state.trace=value.toString();',
		expected: '9'
	},
	{
		name: 'borrowed call collection results stay pending',
		definitions: 'export let release:(()=>void)|undefined;',
		holdPath: 'lookup',
		work: 'const owner=Map.prototype.set.call(this.state.lookup,"x",9);this.state.trace=(owner===this.state.lookup)+":"+this.state.lookup.get("x");',
		expected: 'true:9'
	},
	{
		name: 'borrowed apply collection results stay pending',
		definitions: 'export let release:(()=>void)|undefined;',
		holdPath: 'lookup',
		work: 'const owner=Map.prototype.set.apply(this.state.lookup,["x",9]);this.state.trace=(owner===this.state.lookup)+":"+this.state.lookup.get("x");',
		expected: 'true:9'
	},
	{
		name: 'bound native member collection results stay pending',
		definitions: 'export let release:(()=>void)|undefined;',
		holdPath: 'lookup',
		work: 'const owner=this.state.lookup.set.bind(this.state.lookup,"x",9)();this.state.trace=(owner===this.state.lookup)+":"+this.state.lookup.get("x");',
		expected: 'true:9'
	},
	{
		name: 'captured native member collection results stay pending',
		// Client reactive collections bind selected methods. Raw SSR collections retain native receivers.
		targets: ['client'] as const,
		definitions: 'export let release:(()=>void)|undefined;',
		holdPath: 'lookup',
		work: 'const owner=(()=>{const assign=this.state.lookup.set;return assign("x",9)})();this.state.trace=(owner===this.state.lookup)+":"+this.state.lookup.get("x");',
		expected: 'true:9'
	},
	{
		name: 'captured nested state helper remains pending before success',
		definitions:
			'export let release:(()=>void)|undefined;function assign(owner:{count:number}){owner.count=9;}',
		setup: 'const saved=this.state.nested;',
		holdPath: 'nested',
		work: 'assign(saved);this.state.trace=String(saved.count);',
		expected: '9'
	},
	{
		name: 'captured deep state helper remains pending before success',
		definitions:
			'export let release:(()=>void)|undefined;function assign(owner:{count:number}){owner.count=9;}',
		setup: 'const saved=this.state.nested.deep!;',
		holdPath: 'nested.deep!',
		work: 'assign(saved);this.state.trace=String(saved.count);',
		expected: '9'
	},
	{
		name: 'nested helper binding defaults consume pending values',
		definitions:
			'function assign(owner:{count:number},{value=owner.count}:{value?:number}={}){owner.count=value+1;return value;}',
		work: 'this.state.lookup.set("x",9);this.state.count=9;this.state.trace=assign(this.state)+":"+this.state.count;',
		expected: '9:10'
	},
	{
		name: 'computed helper binding keys consume pending values',
		definitions:
			'function assign(owner:{count:number},{[String(owner.count)]:value}:Record<string,number>){owner.count=value!;return value;}',
		work: 'this.state.lookup.set("x",9);this.state.count=9;this.state.trace=String(assign(this.state,{"9":11}));',
		expected: '11'
	},
	{
		name: 'destructured helper objects and arguments retain authored identity',
		definitions:
			'function assign({nested:ref}:{nested:{count:number}},owner:{nested:{count:number};count:number}){owner.count=ref.count;return (ref===owner.nested)+":"+(arguments[0]===owner);}',
		work: 'this.state.lookup.set("x",9);this.state.nested.count=9;this.state.trace=assign(this.state,this.state);',
		expected: 'true:true'
	},
	{
		name: 'module helper defaults consume pending values',
		definitions:
			'function assign(owner:{count:number},value=owner.count){owner.count=value+1;return value;}',
		work: 'this.state.lookup.set("x",9);this.state.count=9;this.state.trace=assign(this.state)+":"+this.state.count;',
		expected: '9:10'
	},
	{
		name: 'module helper destructuring consumes pending values',
		definitions:
			'function assign({count}:{count:number},owner:{count:number}){owner.count=count+1;return count;}',
		work: 'this.state.lookup.set("x",9);this.state.count=9;this.state.trace=assign(this.state,this.state)+":"+this.state.count;',
		expected: '9:10'
	},
	{
		name: 'ordinary private receiver in pending work',
		work: 'this.state.lookup.set("x",9);class Reader{#count=8;read(){return ++this.#count;}}this.state.trace=String(new Reader().read());',
		expected: '9'
	},
	{
		name: 'pending collection spreads and iteration',
		work: 'this.state.values=[1];this.state.values.push(2);const copied=[...this.state.values];this.state.lookup.set("x",9);const entries=[...this.state.lookup];let total=0;for(const value of this.state.values)total+=value;this.state.trace=copied.join(",")+":"+entries[0]![1]+":"+total;',
		expected: '1,2:9:3'
	},
	{
		name: 'assignment RHS selection',
		work: 'const reader={count:9,read(){return this.count;}};this.state.trace=String(reader.read());reader.count=10;',
		expected: '9'
	},
	{
		name: 'assignment RHS side effect order',
		work: 'let value=0;this.state.trace=String(++value);value++;',
		expected: '1'
	},
	{
		name: 'eager Array length after pending push',
		work: 'this.state.values.push(9);const length=this.state.values.length;this.state.trace=String(length);',
		expected: '1',
		increments: false
	},
	{
		name: 'pending Array mutation results and callbacks',
		work: 'this.state.values=[3,1];const length:number=this.state.values.push(2);this.state.values.sort((left,right)=>left-right);const mapped=this.state.values.map((value,index,receiver)=>value+index+(receiver===this.state.values?0:99));this.state.trace=length+":"+mapped.join(",");',
		expected: '3:1,3,5'
	},
	{
		name: 'typed Map result and eager reads',
		work: 'this.state.lookup=new Map();const result:Map<string,number>=this.state.lookup.set("x",9);this.state.trace=result.get("x")+":"+this.state.lookup.get("x");',
		expected: '9:9'
	},
	{
		name: 'typed Map delete result',
		work: 'this.state.lookup=new Map([["x",9]]);const result:boolean=this.state.lookup.delete("x");this.state.trace=result+":"+this.state.lookup.has("x");',
		expected: 'true:false'
	},
	{
		name: 'typed Map clear result',
		work: 'this.state.lookup=new Map([["x",9]]);const result:void=this.state.lookup.clear();this.state.trace=result+":"+this.state.lookup.size;',
		expected: 'undefined:0'
	},
	{
		name: 'typed Set delete result',
		work: 'this.state.members=new Set([9]);const result:boolean=this.state.members.delete(9);this.state.trace=result+":"+this.state.members.has(9);',
		expected: 'true:false'
	},
	{
		name: 'typed Set clear result',
		work: 'this.state.members=new Set([9]);const result:void=this.state.members.clear();this.state.trace=result+":"+this.state.members.size;',
		expected: 'undefined:0'
	},
	{
		name: 'readonly collection view of pending mutations',
		work: 'this.state.lookup.set("x",9);const view:ReadonlyMap<string,number>=this.state.lookup;const value=view.get("x");this.state.trace=String(value);',
		expected: '9'
	},
	{
		name: 'pending property delete with collection writes',
		work: 'this.state.lookup.set("x",9);const nested=this.state.nested as {count?:number};delete nested.count;this.state.trace=String(this.state.nested.count);',
		expected: 'undefined'
	},
	{
		name: 'pending scalar compound with collection writes',
		work: 'this.state.lookup.set("x",9);this.state.count=1;const previous=this.state.count++;this.state.count+=3;this.state.trace=previous+":"+this.state.count;',
		expected: '1:5'
	},
	{
		name: 'aliased task policy provider',
		work: 'this.state.count=await Promise.resolve(9);this.state.trace=String(this.state.count);',
		expected: '9',
		policyAlias: true
	},
	{
		name: 'queued array arguments',
		work: 'let value=2;this.state.values.push(value);value=9;',
		expected: '2',
		collection: 'values'
	},
	{
		name: 'queued spread arguments',
		work: 'const input=[2];this.state.values.push(...input);input[0]=9;',
		expected: '2',
		collection: 'values'
	},
	{
		name: 'queued loop arguments',
		work: 'for(var index=0;index<3;index++){this.state.values.push(index);}',
		expected: '0,1,2',
		collection: 'values'
	},
	{
		name: 'queued map arguments',
		work: 'let value=2;this.state.lookup.set("key",value);value=9;',
		expected: '2',
		collection: 'lookup'
	},
	{
		name: 'queued set arguments',
		work: 'let value=2;this.state.members.add(value);value=9;',
		expected: '2',
		collection: 'members'
	},
	{
		name: 'class state method receiver',
		work: 'class Reader{state={count:9};read(){return ++this.state.count;}}const value=new Reader().read();this.state.trace=value+":"+this.state.count;',
		expected: '10:0'
	},
	{
		name: 'object state method receiver',
		work: 'const reader={state:{count:9},read(){return this.state.count;}};const value=reader.read();this.state.trace=String(value);',
		expected: '9'
	},
	{
		name: 'function state receiver',
		work: 'function read(this:{state:{count:number}}){return this.state.count;}const value=read.call({state:{count:9}});this.state.trace=String(value);',
		expected: '9'
	},
	{
		name: 'class state field receiver',
		work: 'class Reader{state={count:9};value=this.state.count;read=()=>this.value;}this.state.trace=String(new Reader().read());',
		expected: '9'
	},
	{
		name: 'class state static receiver',
		work: 'class Reader{static state={count:9};static {this.state.count++;}}this.state.trace=String(Reader.state.count);',
		expected: '10'
	},
	{
		name: 'ordinary reflective state receiver',
		work: 'const reader={state:{count:0},read(){Reflect.set(this.state,"count",9);return this.state.count;}};this.state.trace=String(reader.read());',
		expected: '9'
	},
	{
		name: 'loop setter publication order',
		accessor: true,
		work: 'for(let index=0;index<3;index++){const previous=this.state.nested.count++;void previous;}this.state.trace=writes.join(",");',
		expected: ''
	},
	{
		name: 'class computed method name receiver',
		work: 'const owner=this;this.state.trace="read";class Reader{[owner.state.trace as "read"](){return 9;}}const reader=new Reader() as Record<string,()=>number>;this.state.trace=String(reader["read"]!());',
		expected: '9'
	},
	{
		name: 'object computed method name receiver',
		work: 'this.state.trace="read";const reader={count:9,[this.state.trace as "read"](){return this.count;}};this.state.trace=String(reader.read());',
		expected: '9'
	},
	{
		name: 'class field receiver',
		work: 'class Reader{count=9;value=this.count;read=()=>this.value;}this.state.trace=String(new Reader().read());',
		expected: '9'
	},
	{
		name: 'class static receiver',
		work: 'class Reader{static count=9;static value=0;static {this.value=this.count;}}this.state.trace=String(Reader.value);',
		expected: '9'
	},
	{
		name: 'class computed name receiver',
		work: 'const owner=this;this.state.trace="value";const name=owner.state.trace as "value";class Reader{[name]=9;}this.state.trace=String(new Reader().value);',
		expected: '9'
	},
	{
		name: 'SSR returned helper argument',
		work: 'const write=(value:{count:number})=>{value.count=9;return value;};const result=write(this.state.nested);this.state.trace=result.count+":"+this.state.nested.count;',
		expected: '9:9',
		targets: ['server'] as const
	},
	{
		name: 'SSR helper followed by compound read',
		work: 'const write=(value:{count:number})=>{value.count=8;};write(this.state.nested);this.state.nested.count+=1;this.state.trace=String(this.state.nested.count);',
		expected: '9',
		targets: ['server'] as const
	},
	{
		name: 'SSR helper scalar ordering',
		work: 'const write=(value:{count:number})=>{value.count=9;};write(this.state.nested);this.state.trace=String(this.state.nested.count);',
		expected: '9',
		targets: ['server'] as const
	},
	{
		name: 'SSR conditional helper ordering',
		work: 'const write=(value:{count:number})=>{if(value.count===0)value.count=9;};write(this.state.nested);this.state.trace=String(this.state.nested.count);',
		expected: '9',
		targets: ['server'] as const
	},
	{
		name: 'SSR async helper ordering',
		work: 'const write=async(value:{count:number})=>{await Promise.resolve();value.count=9;};await write(this.state.nested);this.state.trace=String(this.state.nested.count);',
		expected: '9',
		targets: ['server'] as const
	},
	{
		name: 'SSR aliased helper argument',
		work: 'const alias=this.state.nested;const write=(value:{count:number})=>{value.count=9;};write(alias);this.state.trace=String(this.state.nested.count);',
		expected: '9',
		targets: ['server'] as const
	},
	{
		name: 'component instance alias',
		work: 'const owner=this;owner.state.count=9;const result=owner.state.count;this.state.trace=String(result);',
		expected: '9'
	},
	{
		name: 'consumed loop updates',
		work: 'this.state.count=0;for(let index=0;index<3;index++){const result=this.state.count++;this.state.trace=result+":"+this.state.count;}',
		expected: '2:3'
	},
	{
		name: 'consumed assignment',
		work: 'this.state.count=1;const result=(this.state.count=9);this.state.trace=result+":"+this.state.count;',
		expected: '9:9'
	},
	{
		name: 'consumed compound',
		work: 'this.state.count=1;const result=(this.state.count+=8);this.state.trace=result+":"+this.state.count;',
		expected: '9:9'
	},
	{
		name: 'consumed prefix',
		work: 'this.state.count=1;const result=++this.state.count;this.state.trace=result+":"+this.state.count;',
		expected: '2:2'
	},
	{
		name: 'consumed postfix',
		work: 'this.state.count=1;const result=this.state.count++;this.state.trace=result+":"+this.state.count;',
		expected: '1:2'
	},
	{
		name: 'consumed awaited compound',
		work: 'this.state.count=1;const result=(this.state.count+=await Promise.resolve(8));this.state.trace=result+":"+this.state.count;',
		expected: '9:9'
	},
	{
		name: 'consumed logical assignment',
		work: 'this.state.count=1;const result=(this.state.count&&=9);this.state.trace=result+":"+this.state.count;',
		expected: '9:9'
	},
	{
		name: 'late closure read',
		work: 'const read=()=>this.state.count;this.state.count=9;const result=read();this.state.trace=String(result);',
		expected: '9'
	},
	{
		name: 'ordinary function receiver',
		work: 'function read(this:{count:number}){return this.count;}this.state.trace=String(read.call({count:9}));',
		expected: '9'
	},
	{
		name: 'object method receiver',
		work: 'const reader={count:9,read(){return this.count}};this.state.trace=String(reader.read());',
		expected: '9'
	},
	{
		name: 'class method receiver',
		work: 'class Reader{count=9;read(){return this.count}};this.state.trace=String(new Reader().read());',
		expected: '9'
	},
	{
		name: 'parent then awaited child',
		work: 'this.state.nested={count:9};this.state.nested.count+=await Promise.resolve(1);this.state.trace=String(this.state.nested.count);',
		expected: '10'
	},
	{
		name: 'child then parent replacement',
		work: 'this.state.nested.count=11;this.state.nested={count:9};const value=this.state.nested.count;this.state.trace=String(value);',
		expected: '9'
	},
	{
		name: 'repeated scalar writes',
		work: 'this.state.count=1;this.state.count=2;this.state.trace=String(this.state.count);',
		expected: '2'
	},
	{
		name: 'parent then child prefix',
		work: 'this.state.nested={count:9};++this.state.nested.count;this.state.trace=String(this.state.nested.count);',
		expected: '10'
	},
	{
		name: 'parent then logical child',
		work: 'this.state.nested={count:9};this.state.nested.count&&=11;this.state.trace=String(this.state.nested.count);',
		expected: '11'
	},
	{
		name: 'parent replacement',
		work: 'this.state.nested={count:9};const value=this.state.nested.count;this.state.trace=String(value);',
		expected: '9'
	},
	{
		name: 'conditional parent replacement',
		work: "if(this.state.trace==='')this.state.nested={count:9};const value=this.state.nested.count;this.state.trace=String(value);",
		expected: '9'
	},
	{
		name: 'parent then child',
		work: 'this.state.nested={count:9};this.state.nested.count+=1;this.state.trace=String(this.state.nested.count);',
		expected: '10'
	},
	{
		name: 'conditional local write',
		work: "if(this.state.trace==='')this.state.count=9;this.state.trace=String(this.state.count);",
		expected: '9'
	},
	{
		name: 'conditional predecessor',
		seed: true,
		work: "if(this.state.trace==='never')this.state.count=99;this.state.trace=String(this.state.count);",
		expected: '5'
	},
	{
		name: 'uncalled predecessor',
		seed: true,
		work: 'const unused=()=>{this.state.count=99};this.state.trace=String(this.state.count);',
		expected: '5'
	},
	{
		name: 'assignment RHS predecessor',
		seed: true,
		work: 'this.state.count=this.state.count+1;this.state.trace=String(this.state.count);',
		expected: '6',
		increments: true
	},
	{
		name: 'conditional predecessor replacement',
		seed: true,
		work: "if(this.state.trace==='')this.state.count=9;this.state.trace=String(this.state.count);",
		expected: '9'
	},
	{
		name: 'short circuit predecessor',
		seed: true,
		work: "this.state.trace==='' && (this.state.count=9);this.state.trace=String(this.state.count);",
		expected: '9'
	},
	{
		name: 'ordered scalar reads',
		work: 'this.state.count=1;this.state.trace=String(this.state.count);',
		expected: '1'
	},
	{
		name: 'ordered collection reads',
		work: 'this.state.values.push(1);this.state.trace=String(this.state.values.length);',
		expected: '1'
	},
	{
		name: 'ordered nested reads',
		work: 'this.state.nested.count=1;this.state.trace=String(this.state.nested.count);',
		expected: '1'
	},
	{
		name: 'literal capture',
		parameters: 'value:number=5,',
		work: 'this.state.trace=String(value);',
		expected: '5'
	},
	{
		name: 'state capture',
		parameters: 'value:number=this.state.count,',
		work: 'this.state.trace=String(value);',
		expected: '0'
	},
	{
		name: 'object capture',
		parameters: '{value}:{value:number}={value:5},',
		work: 'this.state.trace=String(value);',
		expected: '5'
	},
	{
		name: 'tuple capture',
		parameters: '[value]:[number]=[5],',
		work: 'this.state.trace=String(value);',
		expected: '5'
	},
	{
		name: 'dependent capture',
		parameters: 'first:number=5,second:number=first+2,',
		work: 'this.state.trace=String(second);',
		expected: '7'
	}
];
