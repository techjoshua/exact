import type { TaskStateRegressionCase } from './task-state-regression-contract.js';

/** Native expression controls executed through collection-owned pending task cells. */
export const taskPendingRegressionCases: TaskStateRegressionCase[] = [
	{
		name: 'pending object copy',
		work: 'const copy={...{value:this.state.count}};this.state.trace=String(copy.value);',
		expected: '0'
	},
	{
		name: 'pending member deletion',
		work: 'const local:{value?:number}={value:1};this.state.trace=String(delete local.value)+":"+local.value;',
		expected: 'true:undefined'
	},
	{
		name: 'pending computed deletion',
		work: 'const local:{value?:number}={value:1};const key="value";this.state.trace=String(delete local[key])+":"+local[key];',
		expected: 'true:undefined'
	},
	{
		name: 'pending array spread',
		work: 'this.state.values.push(2);const copy=[...this.state.values];this.state.trace=copy.join(",");',
		expected: '0,2'
	},
	{
		name: 'pending for-of receiver',
		work: 'this.state.values.push(2);let total=0;for(const value of this.state.values)total+=value;this.state.trace=String(total);',
		expected: '2'
	},
	{
		name: 'pending inline member helper',
		work: 'const helper={step:(value:number)=>{this.state.count+=value;return this.state.count;}};this.state.trace=String(helper.step(2));',
		expected: '2'
	},
	{
		name: 'pending ordinary awaited assignment',
		work: 'const local={value:1};const result=(local.value+=await Promise.resolve(2));this.state.trace=result+":"+local.value;',
		expected: '3:3'
	},
	{
		name: 'pending ordinary logical assignment',
		work: 'const local={value:0};local.value||=2;local.value&&=3;this.state.trace=String(local.value);',
		expected: '3'
	},
	{
		name: 'pending private field initializer',
		work: 'class Local{#value=1;result=(this.#value+=2);read(){return this.#value;}}const local=new Local();this.state.trace=local.result+":"+local.read();',
		expected: '3:3'
	},
	{
		name: 'pending private call initializer',
		work: 'class Local{#value=1;#read(){return this.#value;}result=this.#read();}this.state.trace=String(new Local().result);',
		expected: '1'
	},
	{
		name: 'pending private getter order',
		work: 'const log:string[]=[];class Local{#value=1;get #read(){log.push("get");return function(this:Local,value:number){log.push("call");return this.#value+value;};}result=(log.push("receiver"),this).#read((log.push("argument"),2));}const local=new Local();this.state.trace=log.join(",")+":"+local.result;',
		expected: 'receiver,get,argument,call:3'
	},
	{
		name: 'pending private arrow initializer',
		work: 'class Local{#value=1;#read=(value:number)=>this.#value+value;result=this.#read(2);}this.state.trace=String(new Local().result);',
		expected: '3'
	},
	{
		name: 'pending private static initializer',
		work: 'class Local{static #value=1;static #read(){return this.#value;}static result=this.#read();}this.state.trace=String(Local.result);',
		expected: '1'
	},
	{
		name: 'pending private optional call',
		work: 'class Local{#value=1;#read(){return this.#value;}result=this.#read?.();}this.state.trace=String(new Local().result);',
		expected: '1'
	},
	{
		name: 'pending absent private optional call',
		work: 'const log:string[]=[];class Local{get #read():((value:number)=>number)|undefined{log.push("get");return undefined;}result=this.#read?.((log.push("argument"),2));}const local=new Local();this.state.trace=log.join(",")+":"+local.result;',
		expected: 'get:undefined'
	},
	{
		name: 'pending private optional getter order',
		work: 'const log:string[]=[];class Local{#value=1;get #read(){log.push("get");return function(this:Local,value:number){log.push("call");return this.#value+value;};}result=(log.push("receiver"),this).#read?.((log.push("argument"),2));}const local=new Local();this.state.trace=log.join(",")+":"+local.result;',
		expected: 'receiver,get,argument,call:3'
	},
	{
		name: 'pending private helper state arguments',
		work: 'class Local{#value=1;#read(owner:{count:number}){owner.count+=this.#value;return owner.count;}result=this.#read(thisState);}const thisState=this.state;this.state.trace=String(new Local().result)+":"+this.state.count;',
		expected: '1:1'
	},
	{
		name: 'pending private template tag',
		work: 'class Local{#value=1;#tag(strings:TemplateStringsArray,value:number){return this.#value+value;}result=this.#tag`value:${2}`;}this.state.trace=String(new Local().result);',
		expected: '3'
	},
	{
		name: 'pending guarded callable',
		work: 'const receiver:{read?:()=>number}={read:()=>this.state.count};if(receiver.read)this.state.trace=String(receiver.read());',
		expected: '0'
	},
	{
		name: 'pending bound helper',
		definitions:
			'function add(this:{value:number},value:number){this.value+=value;return this.value;}',
		work: 'const local={value:1};const step=add.bind(local);this.state.trace=String(step(2));',
		expected: '3'
	},
	{
		name: 'pending returned callable',
		definitions: 'function make(value:number){return()=>value+1;}',
		work: 'this.state.trace=String(make(this.state.count)());',
		expected: '1'
	},
	{
		name: 'pending bare template tag',
		definitions:
			'function tag(strings:TemplateStringsArray,value:number){return strings.raw[0]+value;}',
		work: 'this.state.trace=tag`value:${this.state.count}`;',
		expected: 'value:0'
	},
	{
		name: 'pending member template tag',
		work: 'let site:TemplateStringsArray|undefined;const log:string[]=[];const tags={tag(strings:TemplateStringsArray,value:number){if(this!==tags)throw new Error("receiver");log.push((site===undefined?"first":site===strings?"same":"changed")+":"+value);site=strings;return value;}};for(let index=0;index<2;index++){const result=tags.tag`count:${this.state.count++}`;log.push(String(result));}this.state.trace=log.join(",")+":"+this.state.count;',
		expected: 'first:0,0,same:1,1:2'
	},
	{
		name: 'pending computed template tag',
		work: 'const log:string[]=[];const tags={get tag(){log.push("get");return function(this:object,_strings:TemplateStringsArray,value:number){log.push(this===tags?"receiver":"lost");return value;};}};const key={toString(){log.push("key");return "tag";}};const result=tags[key as unknown as "tag"]`count:${(log.push("substitution"),this.state.count=3)}`;this.state.trace=log.join(",")+":"+result;',
		expected: 'key,get,substitution,receiver:3'
	}
].map((example) => ({
	...example,
	work: 'this.state.values=[];this.state.values.push(0);this.state.count=0;' + example.work
}));
