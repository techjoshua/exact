import type { TaskStateRegressionCase } from './task-state-regression-contract.js';

/** Optional chains retain capture boundaries, staged receivers and native evaluation order. */
export const taskOptionalRegressionCases: TaskStateRegressionCase[] = [
	{
		name: 'nested absent optional argument preserves the local helper default',
		work: 'this.state.values.push(0);const consume=(value?:number)=>value??1;const absent=undefined as {value:number}|undefined;this.state.trace=String(consume?.(absent?.value));',
		expected: '1'
	},
	{
		name: 'nested present optional argument reads staged component state',
		work: 'this.state.values.push(0);this.state.nested.count=7;const consume=(value?:number)=>value??1;this.state.trace=String(consume?.(this.state.nested?.count));',
		expected: '7'
	},
	{
		name: 'nested optional computed key reads staged component state',
		work: 'this.state.lookup.set("x",9);this.state.nested.count=1;const labels=["zero","one"];this.state.trace=String(labels?.[this.state.nested?.count]);',
		expected: 'one'
	},
	{
		name: 'nested optional native call argument reads staged component state',
		work: 'this.state.values=[3,7];this.state.values.push(0);this.state.nested.count=1;this.state.trace=String(this.state.values?.at(this.state.nested?.count));',
		expected: '7'
	},
	{
		name: 'optional non-null continuation skips an absent receiver',
		work: 'this.state.lookup.set("x",9);const absent=()=>null as {nested:{count:number}}|null;let failure="";let value:number|undefined;try{value=absent()?.nested!.count;}catch{failure="throw";}this.state.trace=String(value)+":"+failure;',
		expected: 'undefined:'
	},
	{
		name: 'optional non-null state continuation skips an absent receiver',
		work: 'this.state.lookup.set("x",9);const clear=()=>{this.state.nested.deep=undefined;};clear();this.state.trace=String(this.state.nested.deep?.count!.toString());',
		expected: 'undefined'
	},
	{
		name: 'optional state preparation skips an absent receiver on later invocations',
		setup: 'const reset=()=>{this.state.nested.deep=undefined;};reset();',
		work: 'this.state.lookup.set("x",9);const clear=()=>{this.state.nested.deep=undefined;};clear();this.state.trace=String(this.state.nested.deep?.count!.toString());',
		expected: 'undefined'
	},
	{
		name: 'captured optional state continuation skips an absent receiver',
		setup: 'const reset=()=>{this.state.nested.deep=undefined;};reset();',
		work: 'this.state.lookup.set("x",9);this.state.trace=String(this.state.nested.deep?.count!.toString());',
		expected: 'undefined'
	},
	{
		name: 'captured optional computed state continuation skips an absent receiver',
		setup: 'const reset=()=>{this.state.nested.deep=undefined;};reset();',
		work: 'this.state.lookup.set("x",9);this.state.trace=String(this.state.nested.deep?.["count"]!.toString());',
		expected: 'undefined'
	},
	{
		name: 'captured optional aliased state continuation skips an absent receiver',
		setup: 'const holder=this.state.nested;const reset=()=>{holder.deep=undefined;};reset();',
		work: 'this.state.lookup.set("x",9);this.state.trace=String(holder.deep?.count!.toString());',
		expected: 'undefined'
	},
	{
		name: 'captured optional state call retains a present receiver',
		work: 'this.state.lookup.set("x",9);this.state.trace=String(this.state.nested.deep?.count.toFixed(1));',
		expected: '0.0'
	},
	{
		name: 'captured optional assertion before a state member skips an absent receiver',
		extraState: 'outer:{nested:{count:number}|undefined}|null;',
		setup: 'this.state.outer=null;',
		work: 'this.state.lookup.set("x",9);this.state.trace=String(this.state.outer?.nested!.count);',
		expected: 'undefined'
	},
	{
		name: 'optional computed selector skips key effects for an absent state receiver',
		extraState: 'outer:{nested:{count:number}|undefined}|null;',
		setup: 'this.state.outer=null;',
		work: 'this.state.lookup.set("x",9);let keys=0;const key=()=>{keys++;return "nested" as const;};const result=this.state.outer?.[key()]!.count;this.state.trace=String(result)+":"+keys;',
		expected: 'undefined:0'
	},
	{
		name: 'optional computed selector evaluates its key once for present staged state',
		extraState: 'outer:{nested:{count:number}|undefined}|null;',
		setup: 'this.state.outer=null;',
		work: 'this.state.lookup.set("x",9);this.state.outer={nested:{count:7}};let keys=0;const key=()=>{keys++;return "nested" as const;};const result=this.state.outer?.[key()]!.count;this.state.trace=String(result)+":"+keys;',
		expected: '7:1'
	},
	{
		name: 'unchanged helper preserves optional non-null short circuit',
		definitions:
			'function absentRead(){const owner=()=>null as {nested:{count:number}}|null;return owner()?.nested!.count;}',
		work: 'this.state.lookup.set("x",9);this.state.trace=String(absentRead());',
		expected: 'undefined'
	},
	{
		name: 'parenthesized optional non-null chain keeps its authored break',
		work: 'this.state.lookup.set("x",9);const absent=()=>null as {nested:{count:number}}|null;let failure="";try{(absent()?.nested)!.count;}catch{failure="throw";}this.state.trace=failure;',
		expected: 'throw'
	},
	{
		name: 'optional native calls retain pending results and receiver identity',
		work: 'this.state.values=[];const length=this.state.values?.push(9);const owner=this.state.lookup?.set("x",9);this.state.trace=length+":"+(owner===this.state.lookup)+":"+owner?.get("x");',
		expected: '1:true:9'
	},
	{
		name: 'optional delete consumes pending property and skips absent keys',
		work: 'this.state.lookup.set("x",9);const nested=this.state.nested as {count?:number};let keys=0;const absent=null as {count?:number}|null;const skipped=delete absent?.[String(++keys) as "count"];const removed=delete nested?.count;this.state.trace=skipped+":"+removed+":"+keys+":"+nested.count;',
		expected: 'true:true:0:undefined'
	},
	{
		name: 'optional unchanged helper consumes pending state',
		definitions: 'function read(owner:{count:number}){return owner.count;}',
		work: 'this.state.lookup.set("x",9);this.state.count=9;this.state.trace=String(read?.(this.state));',
		expected: '9'
	},
	{
		name: 'optional chain skips computed keys and retains intermediate failure',
		work: 'this.state.values=[];this.state.values.push(1);let calls=0;const absent=()=>null as {nested:{count:number}}|null;const omitted=absent()?.[String(++calls) as "nested"].count;const present=()=>({nested:undefined as {count:number}|undefined});let failure="";try{present()?.nested!.count;}catch{failure="throw";}this.state.trace=this.state.values?.length+":"+calls+":"+omitted+":"+failure;',
		expected: '1:0:undefined:throw'
	},
	{
		name: 'optional property read observes pending array length',
		work: 'this.state.values=[];this.state.values.push(1);this.state.trace=String(this.state.values?.length);',
		expected: '1'
	},
	{
		name: 'ordinary optional receiver in pending work',
		work: 'this.state.lookup.set("x",9);const reader:{value?:{count:number}}={};const value=reader.value?.count;this.state.trace=String(value);',
		expected: 'undefined'
	}
];
