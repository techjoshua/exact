import { expect, it } from 'vitest';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

const cases = {
	'nested destructuring destinations':
		'const input={nested:[3,4]};({nested:[owner.value,owner.values[0]]}=input);',
	'for-of assignment destination': 'for(owner.value of [2,3])owner.values.push(owner.value);',
	'for-in assignment destination': 'for(owner.trace[0] in {a:1,b:2})owner.value++;',
	'computed destination default order':
		'const select=()=>{owner.trace.push("receiver");return owner;};[select().value=(owner.trace.push("default"),3)]=[undefined];',
	'rest assignment destination':
		'const input:[string,...number[]]=["first",2,3];[owner.trace[0],...owner.values]=input;owner.value=3;',
	'partial assignment before failure':
		'const input:[number,undefined]=[2,undefined];try{[owner.value,owner.values[0]=(owner.trace.push("default"),(()=>{throw new Error("stop");})())]=input;}catch{owner.trace.push("caught");}',
	'assignment result identity':
		'const input=[3];const result=([owner.value]=input);if(result!==input)throw new Error("assignment changed input identity");',
	'sparse array defaults':
		'const input:[number?,number?]=[,4];[owner.value=3,owner.values[0]=0]=input;',
	'iterator close on break':
		'function* items(){try{yield 2;yield 3;}finally{owner.trace.push("close");}}for(const value of items()){owner.value=value;break;}',
	'iterator close on throw':
		'function* items(){try{yield 2;yield 3;}finally{owner.trace.push("close");}}try{for(const value of items()){owner.value=value;throw new Error("stop");}}catch{owner.trace.push("caught");}',
	'iterator close on destructuring':
		'function* items(){try{yield 2;yield 3;}finally{owner.trace.push("close");}}[owner.value]=items();',
	'getter spread and default order':
		'const source={get value(){owner.trace.push("get");return undefined;}};const copy={...source};const {value=(owner.trace.push("default"),3)}=copy;owner.value=value;',
	'getter direct read':
		'const source={get value(){owner.trace.push("get");return 3;}};owner.value=source.value;',
	'copied reference identity':
		'const source={get values(){owner.trace.push("get");return owner.values;}};const copy={...source};if(copy.values!==owner.values)throw new Error("copy changed reference identity");owner.value=3;',
	'copied callable identity':
		'const source={work(){owner.value++;}};const copy={...source};if(copy.work!==source.work)throw new Error("copy rebound callable");copy.work();',
	'computed getter copy':
		'const key=Symbol("value");const source={get [key](){owner.trace.push("get");return 3;}};const copy={...source};owner.value=copy[key];',
	'dynamic method overwrite':
		'const key=String("work");const source={work(){owner.trace.push("first");},[key](){owner.trace.push("last");owner.value=3;}};source.work();',
	'spread method overwrite':
		'const key=String("work");const source={[key](){owner.trace.push("first");},...{work(){owner.trace.push("last");owner.value=3;}}};source.work();',
	'spread excludes hidden replacements':
		'const key=String("value");const hidden=Object.defineProperty({} as Record<string,number>,"value",{value:9,enumerable:false});const source={get [key](){owner.trace.push("get");return 3;},...hidden};owner.value=source.value;',
	'dynamic accessor pairing':
		'const key=String("value");const source={get [key](){owner.trace.push("get");return owner.value;},set [key](value:number){owner.trace.push("set");owner.value=value;}};source[key]=3;if(source[key]!==3)throw new Error("paired accessors changed");',
	'computed prototype property':
		'const key=String("__proto__");const source={get [key](){owner.trace.push("get");return 3;},__proto__:null};owner.value=Number(source[key]);',
	'getter exception ordering':
		'const source={get first(){owner.trace.push("first");return 2;},get second(){owner.trace.push("second");throw new Error("stop");},get third(){owner.trace.push("third");return 3;}};try{const copy={...source};void copy;}catch{owner.trace.push("caught");}owner.value=3;',
	'local setter captured writes':
		'const source={set value(value:number){owner.value=value;owner.trace.push("set");}};source.value=3;',
	'logical assignment selection':
		'owner.value ||= (owner.trace.push("or"),2);owner.value &&= (owner.trace.push("and"),3);owner.value ??= (owner.trace.push("nullish"),4);',
	'assignment expression result':
		'const before=owner.value++;const after=++owner.value;const assigned=(owner.value+=3);owner.trace.push(`${before}:${after}:${assigned}`);',
	'parent replacement followed by child write':
		'owner.values=[2];owner.values[0]+=1;owner.value=owner.values[0];',
	'child write followed by parent replacement':
		'owner.values[0]=2;owner.values=[owner.values[0]+1];owner.value=owner.values[0];',
	'default capture reads current pending value':
		'const read=(value=owner.value)=>value;owner.value=3;owner.trace.push(String(read()));',
	'helper closure and captured mutation':
		'const add=(value:number)=>()=>{owner.value+=value;return owner.value;};const step=add(2);owner.trace.push(String(step()));owner.trace.push(String(step()));',
	'optional and logical selection':
		'const absent=(()=>undefined as {value?:number}|undefined)();owner.value=absent?.value??(owner.trace.push("fallback"),3);'
};

for (const target of ['client', 'server'] as const)
	for (const [name, body] of Object.entries(cases))
		it(`retains ${name} evaluation through pending helpers (${target})`, async () => {
			const source = `type Owner={value:number;values:number[];trace:string[]};export function work(owner:Owner){${body}return JSON.stringify({value:owner.value,values:[...owner.values],trace:[...owner.trace]});}`;
			const { compiled, authored, runtime } = await privateHelperArtifact(source, target);
			const reference = { value: 0, values: [] as number[], trace: [] as string[] };
			const expected = (authored.work as (owner: typeof reference) => string)(reference);
			const owner = { value: 0, values: [] as number[], trace: [] as string[] };
			const root = { owner };
			for (const settlement of ['discard', 'commit'] as const) {
				const pending = runtime.createPendingReactiveTransaction(root);
				pending.read(root, 'owner');
				expect(pending.helper(compiled.work)(owner)).toBe(expected);
				expect(owner).toEqual({ value: 0, values: [], trace: [] });
				pending[settlement]();
				expect(owner).toEqual(
					settlement === 'commit' ? reference : { value: 0, values: [], trace: [] }
				);
			}
		});
