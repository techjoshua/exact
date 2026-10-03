import type { TaskStateRegressionCase } from './task-state-regression-contract.js';

/** Evaluation order, abrupt completion and native syntax controls at component task boundaries. */
export const taskEvaluationRegressionCases: TaskStateRegressionCase[] = [
	{
		name: 'iterator closing and continue in component tasks',
		work: 'const log:string[]=[];function* values(){try{yield 1;yield 2;yield 3;}finally{log.push("close");}}for(const value of values()){this.state.count=value;if(value===1){log.push("continue");continue;}log.push(String(value));break;}this.state.trace=log.join(",")+":"+this.state.count;',
		expected: 'continue,2,close:2'
	},
	{
		name: 'iterator closes before task exceptional completion is handled',
		work: 'const log:string[]=[];function* values(){try{yield 2;yield 3;}finally{log.push("close");}}try{for(const value of values()){this.state.count=value;throw new Error("stop");}}catch{log.push("caught");}this.state.trace=log.join(",")+":"+this.state.count;',
		expected: 'close,caught:2'
	},
	{
		name: 'iterator closes before task early return finalization',
		work: 'const log:string[]=[];function* values(){try{yield 2;yield 3;}finally{log.push("close");}}try{for(const value of values()){this.state.count=value;return;}}finally{this.state.trace=log.join(",")+":"+this.state.count;}',
		expected: 'close:2'
	},
	{
		name: 'sparse destructuring and assignment result in component tasks',
		work: 'const input:[number?,number?]=[,4];const result=([this.state.count=3,this.state.nested.count=0]=input);this.state.trace=this.state.count+":"+this.state.nested.count+":"+(result===input);',
		expected: '3:4:true'
	},
	{
		name: 'custom destructuring iterator closes after selected state write',
		work: 'const log:string[]=[];const values={[Symbol.iterator](){let index=0;return{next(){log.push("next");return{done:false,value:++index};},return(){log.push("close");return{done:true,value:0};}};}};[this.state.count]=values;this.state.trace=log.join(",")+":"+this.state.count;',
		expected: 'next,close:1'
	},
	{
		name: 'accessor spreads retain order with pending state defaults',
		work: 'const log:string[]=[];this.state.count=3;const input={get value(){log.push("get");return undefined;}};const copy={...input};const{value=(log.push("default"),this.state.count)}=copy;this.state.trace=log.join(",")+":"+value;',
		expected: 'get,default:3'
	},
	{
		name: 'logical operator results retain pending state selection',
		work: 'const log:string[]=[];this.state.count=0;const first=(this.state.count||=(log.push("or"),2));const second=(this.state.count&&=(log.push("and"),3));const third=(this.state.count??=(log.push("nullish"),4));this.state.trace=first+":"+second+":"+third+":"+log.join(",");',
		expected: '2:3:3:or,and'
	},
	{
		name: 'task local using owns lexical disposal',
		disposable: true,
		work: 'const log:string[]=[];{using resource={[Symbol.dispose](){log.push("dispose");}};void resource;this.state.count=3;log.push("body");}this.state.trace=log.join(",")+":"+this.state.count;',
		expected: 'body,dispose:3'
	},
	{
		name: 'task local await using completes disposal before publication',
		disposable: true,
		work: 'const log:string[]=[];{await using resource={async[Symbol.asyncDispose](){await Promise.resolve();log.push("dispose");}};void resource;this.state.count=3;log.push("body");}this.state.trace=log.join(",")+":"+this.state.count;',
		expected: 'body,dispose:3'
	},
	{
		name: 'task local resource closes before caught abrupt completion',
		disposable: true,
		work: 'const log:string[]=[];try{using resource={[Symbol.dispose](){log.push("dispose");}};void resource;this.state.count=3;throw new Error("stop");}catch{log.push("caught");}this.state.trace=log.join(",")+":"+this.state.count;',
		expected: 'dispose,caught:3'
	},
	{
		name: 'task local async resource closes before caught abrupt completion',
		disposable: true,
		work: 'const log:string[]=[];try{await using resource={async[Symbol.asyncDispose](){await Promise.resolve();log.push("dispose");}};void resource;this.state.count=3;throw new Error("stop");}catch{log.push("caught");}this.state.trace=log.join(",")+":"+this.state.count;',
		expected: 'dispose,caught:3'
	},
	{
		name: 'async iterator closes on task loop break',
		work: 'const log:string[]=[];async function* values(){try{yield 2;yield 3;}finally{await Promise.resolve();log.push("close");}}for await(const value of values()){this.state.count=value;break;}this.state.trace=log.join(",")+":"+this.state.count;',
		expected: 'close:2'
	},
	{
		name: 'ordinary enum namespace and decorator helpers retain task inputs',
		definitions:
			'enum Step{Initial=2} namespace Steps{export const next=Step.Initial+1;}function unchanged<T extends new(...args:never[])=>object>(value:T){return value;}@unchanged class Reader{read(value:number){return value+Steps.next;}}',
		work: 'this.state.count=2;this.state.trace=String(new Reader().read(this.state.count));',
		expected: '5'
	},
	{
		name: 'bigint regexp and Unicode values retain task evaluation',
		work: 'const value=2n**5n;const input="caf\\u00e9 \\u{1f642}";const regexp=/caf\\u00e9/gu;this.state.trace=value+":"+regexp.test(input)+":"+input;',
		expected: '32:true:café 🙂'
	},
	{
		name: 'tagged templates retain site identity receiver and substitution order',
		work: 'let site:TemplateStringsArray|undefined;const log:string[]=[];const tags={tag(strings:TemplateStringsArray,value:number){if(this!==tags)throw new Error("receiver");log.push((site===undefined?"first":site===strings?"same":"changed")+":"+value);site=strings;return value;}};this.state.count=0;for(let index=0;index<2;index++){const result=tags.tag`count:${this.state.count++}`;log.push(String(result));}this.state.trace=log.join(",")+":"+this.state.count;',
		expected: 'first:0,0,same:1,1:2'
	},
	{
		name: 'computed template tag getter precedes substitutions exactly once',
		work: 'const log:string[]=[];const tags={get tag(){log.push("get");return function(this:object,_strings:TemplateStringsArray,value:number){log.push(this===tags?"receiver":"lost");return value;};}};const key={toString(){log.push("key");return "tag";}};const result=tags[key as unknown as "tag"]`count:${(log.push("substitution"),this.state.count=3)}`;this.state.trace=log.join(",")+":"+result;',
		expected: 'key,get,substitution,receiver:3'
	},
	{
		name: 'owned template tag publishes its supported receiver fields',
		extraState: 'tags?:{prefix:string;tag(strings:TemplateStringsArray,value:number):string};',
		work: 'this.state.tags={prefix:"p",tag(_strings,value){this.prefix+="!";return this.prefix+value;}};this.state.count=3;const result=this.state.tags.tag`count:${this.state.count}`;this.state.trace=result+":"+this.state.tags.prefix;',
		expected: 'p!3:p!'
	},
	{
		name: 'ordinary callable template tag preserves native literal data',
		definitions:
			'function tag(strings:TemplateStringsArray,value:number){return strings.raw[0]+":"+strings[0]+":"+value;}',
		work: 'this.state.count=3;this.state.trace=tag`\\n${this.state.count}`;',
		expected: '\\n:\n:3'
	}
];
