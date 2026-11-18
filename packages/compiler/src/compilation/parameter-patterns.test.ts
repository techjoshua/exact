import { it } from 'vitest';
import { assertOrdinaryModuleNamespaces } from '../test-support/module-namespace.js';

type ParameterPatternTest = Parameters<typeof assertOrdinaryModuleNamespaces>[0] & { name: string };

// Binding itself executes getters, including for unused names. Check full target namespaces
// independently of analysis placement, and preserve ordinary unused identifier inputs.
// Returned argument and exception controls retain their preexisting unknown placement,
// while complete namespaces and order are still required on each target.
it.each<ParameterPatternTest>([
	{
		name: 'default execution finding-direct-default-bypass-False',
		source: `function read({inner}:{inner:{value:string}},value=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},"safe");`,
		browser: false
	},
	{
		name: 'default execution finding-direct-default-bypass-True',
		source: `function read({inner}:{inner:{value:string}},value=inner.value){inner={value:"safe"};return value}export const value=read({inner:{get value(){return document.title}}},"safe");`,
		browser: false
	},
	{
		name: 'default execution finding-projected-default-bypass-False',
		source: `function make(){return ({inner}:{inner:{value:string}},value=inner.value)=>{return value}}export const value=[make()][0]!({inner:{get value(){return document.title}}},"safe");`,
		browser: false
	},
	{
		name: 'default execution finding-projected-default-bypass-True',
		source: `function make(){return ({inner}:{inner:{value:string}},value=inner.value)=>{inner={value:"safe"};return value}}export const value=[make()][0]!({inner:{get value(){return document.title}}},"safe");`,
		browser: false
	},
	{
		name: 'default execution finding-default-bypass-identifier-formal',
		source: `function read(inner:{value:string},value=inner.value){inner={value:"safe"};return value}export const value=read({get value(){return document.title}},"safe");`,
		browser: false
	},
	{
		name: 'default execution default-direct-missing',
		source: `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}});`,
		browser: true
	},
	{
		name: 'default execution default-direct-undefined',
		source: `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},undefined);`,
		browser: true
	},
	{
		name: 'default execution default-direct-null',
		source: `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},null);`,
		browser: false,
		extras: { value: null }
	},
	{
		name: 'default execution default-direct-false',
		source: `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},false);`,
		browser: false,
		extras: { value: false }
	},
	{
		name: 'default execution default-direct-zero',
		source: `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},0);`,
		browser: false,
		extras: { value: 0 }
	},
	{
		name: 'default execution default-direct-empty',
		source: `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},"");`,
		browser: false,
		extras: { value: '' }
	},
	{
		name: 'default execution default-direct-safe',
		source: `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},"safe");`,
		browser: false,
		extras: { value: 'safe' }
	},
	{
		name: 'default execution default-projected-missing',
		source: `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: true
	},
	{
		name: 'default execution default-projected-undefined',
		source: `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}},undefined);`,
		browser: true
	},
	{
		name: 'default execution default-projected-null',
		source: `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}},null);`,
		browser: false,
		extras: { value: null }
	},
	{
		name: 'default execution default-projected-false',
		source: `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}},false);`,
		browser: false,
		extras: { value: false }
	},
	{
		name: 'default execution default-projected-zero',
		source: `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}},0);`,
		browser: false,
		extras: { value: 0 }
	},
	{
		name: 'default execution default-projected-empty',
		source: `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}},"");`,
		browser: false,
		extras: { value: '' }
	},
	{
		name: 'default execution default-projected-safe',
		source: `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}},"safe");`,
		browser: false,
		extras: { value: 'safe' }
	},
	{
		name: 'default execution default-nested-bypass',
		source: `function read({inner,value=inner.value}:{inner:{value:string},value?:string}){return value}export const value=read({inner:{get value(){return document.title}},value:"safe"});`,
		browser: false
	},
	{
		name: 'default execution default-nested-taken',
		source: `function read({inner,value=inner.value}:{inner:{value:string},value?:string}){return value}export const value=read({inner:{get value(){return document.title}}});`,
		browser: true
	},
	{
		name: 'default execution default-unused-pattern-default',
		source: `function read({inner}:{inner:{value:string}},value=inner.value){return "safe"}export const value=read({inner:{get value(){return document.title}}});`,
		browser: true,
		extras: { value: 'safe' }
	},
	{
		name: 'default execution default-unused-default-bypass',
		source: `function read({inner}:{inner:{value:string}},value=inner.value){return "safe"}export const value=read({inner:{get value(){return document.title}}},"safe");`,
		browser: false
	},
	{
		name: 'default execution default-plain-default',
		source: `function read({inner}:{inner:{value:string}},value=inner.value){return value}export const value=read({inner:{value:"safe"}});`,
		browser: false
	},
	{
		name: 'default execution default-earlier-chain',
		source: `function read({inner}:{inner:{value:string}},second=inner,third=second.value){return third}export const value=read({inner:{get value(){return document.title}}});`,
		browser: true
	},
	{
		name: 'default execution default-rest-default-bypass',
		source: `function read({inner,...rest}:{inner:{value:string},value:string},value=inner.value){return value+rest.value}export const value=read({inner:{get value(){return document.title}},value:""},"safe");`,
		browser: false
	},
	{
		name: 'default execution default-defined-object-bypass',
		source: `function read({inner}:{inner:{value:string}},value:unknown=inner.value){return "safe"}export const value=read({inner:{get value(){return document.title}}},{});`,
		browser: false
	},
	{
		name: 'default execution default-argument-runs',
		source: `function read({inner}:{inner:{value:string}},value=inner.value){return "safe"}export const value=read({inner:{value:"safe"}},document.title);`,
		browser: true,
		extras: { value: 'safe' }
	},
	{
		name: 'default execution expansion-direct-global-bypass',
		source: `function read(value=document.title){return value}export const value=read("safe");`,
		browser: false
	},
	{
		name: 'default execution expansion-projected-global-bypass',
		source: `function make(){return (value=document.title)=>value}export const value=[make()][0]!("safe");`,
		browser: false
	},
	{
		name: 'default execution expansion-call-default-bypass',
		source: `function browser(){return document.title}function read({inner}:{inner:{value:string}},value=browser()){return value}export const value=read({inner:{value:"safe"}},"safe");`,
		browser: false
	},
	{
		name: 'default execution expansion-call-default-taken',
		source: `function browser(){return document.title}function read({inner}:{inner:{value:string}},value=browser()){return value}export const value=read({inner:{value:"safe"}});`,
		browser: true
	},
	{
		name: 'default execution expansion-conditional-known-safe',
		source: `function read({inner}:{inner:{value:string}},value=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},true?"safe":undefined);`,
		browser: false
	},
	{
		name: 'default execution expansion-conditional-known-undefined',
		source: `function read({inner}:{inner:{value:string}},value=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},false?"safe":undefined);`,
		browser: true
	},
	{
		name: 'default execution expansion-nested-deep-bypass',
		source: `function read({inner,outer:{value=inner.value}}:{inner:{value:string},outer:{value?:string}}){return value}export const value=read({inner:{get value(){return document.title}},outer:{value:"safe"}});`,
		browser: false
	},
	{
		name: 'default execution expansion-nested-deep-taken',
		source: `function read({inner,outer:{value=inner.value}}:{inner:{value:string},outer:{value?:string}}){return value}export const value=read({inner:{get value(){return document.title}},outer:{}});`,
		browser: true
	},
	{
		name: 'default execution expansion-local-default-bypass',
		source: `function read({inner}:{inner:{value:string}}){const {value=inner.value}={value:"safe"};return value}export const value=read({inner:{get value(){return document.title}}});`,
		browser: false
	},
	{
		name: 'default execution expansion-local-default-taken',
		source: `function read({inner}:{inner:{value:string}}){const {value=inner.value}: {value?:string}={};return value}export const value=read({inner:{get value(){return document.title}}});`,
		browser: true
	},
	{
		name: 'default execution expansion-getter-before-rebind',
		source: `function read({inner}:{inner:{value:string}},value=inner.value){inner={value:"safe"};return "safe"}export const value=read({inner:{get value(){return document.title}}});`,
		browser: true,
		extras: { value: 'safe' }
	},
	{
		name: 'default execution expansion-alias-default',
		source: `function read({inner}:{inner:{value:string}},second=inner,third=second.value){inner={value:"safe"};return third}export const value=read({inner:{get value(){return document.title}}});`,
		browser: true
	},
	{
		name: 'binding replacement reassign-safe',
		source: `function make(){return ({inner}:{inner:{value:string}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: false
	},
	{
		name: 'binding replacement local-reassign-safe',
		source: `function make(){return (input:{inner:{value:string}})=>{let {inner}=input;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: false
	},
	{
		name: 'binding replacement local-reassign-browser',
		source: `function make(){return (input:{inner:{value:string}})=>{let {inner}=input;inner={get value(){return document.title}};return inner.value}}export const value=[make()][0]!({inner:{value:"safe"}});`,
		browser: true
	},
	{
		name: 'binding replacement computed-safe',
		source: `function make(){return ({["inner"]:inner}:{inner:{value:string}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: false
	},
	{
		name: 'binding replacement formal-safe-direct',
		source: `function read({inner}:{inner:{value:string}}){inner={value:"safe"};return inner.value}export const value=read({inner:{get value(){return document.title}}});`,
		browser: false
	},
	{
		name: 'binding replacement formal-alias-safe',
		source: `function make(){return ({inner:alias}:{inner:{value:string}})=>{alias={value:"safe"};return alias.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: false
	},
	{
		name: 'binding replacement formal-nested-safe',
		source: `function make(){return ({outer:{inner}}:{outer:{inner:{value:string}}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({outer:{inner:{get value(){return document.title}}}});`,
		browser: false
	},
	{
		name: 'binding replacement formal-rest-safe',
		source: `function make(){return ({...rest}:{inner:{value:string}})=>{rest={inner:{value:"safe"}};return rest.inner.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: false
	},
	{
		name: 'binding replacement identifier-reassign-safe',
		source: `function make(){return (inner:{value:string})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({get value(){return document.title}});`,
		browser: false
	},
	{
		name: 'binding replacement local-alias-safe',
		source: `function make(){return (input:{inner:{value:string}})=>{let {inner:alias}=input;alias={value:"safe"};return alias.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: false
	},
	{
		name: 'binding replacement local-rest-safe',
		source: `function make(){return (input:{inner:{value:string}})=>{let {...rest}=input;rest={inner:{value:"safe"}};return rest.inner.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: false
	},
	{
		name: 'binding replacement local-identifier-safe',
		source: `function make(){return (input:{inner:{value:string}})=>{let inner=input.inner;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: false,
		placement: 'unknown' as const
	},
	{
		name: 'binding replacement formal-initial-binding-effect',
		source: `function make(){return ({inner}:{inner:{value:string}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({get inner(){document.title;return {value:"safe"}}});`,
		browser: true,
		extras: { value: 'safe' }
	},
	{
		name: 'binding replacement formal-final-browser',
		source: `function make(){return ({inner}:{inner:{value:string}})=>{inner={get value(){return document.title}};return inner.value}}export const value=[make()][0]!({inner:{value:"safe"}});`,
		browser: true
	},
	{
		name: 'binding replacement formal-plain-reassign',
		source: `function make(){return ({inner}:{inner:{value:string}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({inner:{value:"old"}});`,
		browser: false
	},
	{
		name: 'binding replacement formal-safe-after-read',
		source: `function make(){return ({inner}:{inner:{value:string}})=>{const value=inner.value;inner={value:"safe"};return value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: true
	},
	{
		name: 'binding replacement old-alias-browser',
		source: `function make(){return ({inner}:{inner:{value:string}})=>{const old=inner;inner={value:"safe"};return old.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: true
	},
	{
		name: 'binding replacement old-alias-safe',
		source: `function make(){return ({inner}:{inner:{value:string}})=>{const old=inner;inner={get value(){return document.title}};return old.value}}export const value=[make()][0]!({inner:{value:"safe"}});`,
		browser: false
	},
	{
		name: 'binding replacement replacement-alias-safe',
		source: `function make(){return ({inner}:{inner:{value:string}})=>{inner={value:"safe"};const old=inner;return old.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: false
	},
	{
		name: 'binding replacement member-mutation-old-alias',
		source: `function make(){return ({inner}:{inner:{value:string}})=>{const old=inner;inner={value:"safe"};old.value=document.title;return old.value}}export const value=[make()][0]!({inner:{value:"safe"}});`,
		browser: true
	},
	{
		name: 'binding replacement returned-replacement-object',
		source: `function read({inner}:{inner:{value:string}}){inner={value:"safe"};return inner}export const value=read({inner:{get value(){return document.title}}}).value;`,
		browser: false
	},
	{
		name: 'binding replacement local-nested-safe',
		source: `function make(){return (input:{outer:{inner:{value:string}}})=>{let {outer:{inner}}=input;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({outer:{inner:{get value(){return document.title}}}});`,
		browser: false
	},
	{
		name: 'binding replacement default-safe-replaced',
		source: `function make(){return ({inner={get value(){return document.title}}}:{inner?:{value:string}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({});`,
		browser: false
	},
	{
		name: 'binding replacement default-binding-browser',
		source: `function make(){return ({inner=(document.title,{value:"safe"})}:{inner?:{value:string}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({});`,
		browser: true,
		extras: { value: 'safe' }
	},
	{
		name: 'binding replacement rest-binding-browser',
		source: `function make(){return ({...rest}:{inner:{value:string}})=>{rest={inner:{value:"safe"}};return rest.inner.value}}export const value=[make()][0]!({get inner(){document.title;return {value:"safe"}}});`,
		browser: true,
		extras: { value: 'safe' }
	},
	{
		name: 'binding replacement native-acquired-method',
		source: `function make(){return ({inner}:{inner:{value:string;read():string}})=>{const old=inner;inner={value:"safe",read(){return this.value}};return old.read()}}export const value=[make()][0]!({inner:{value:"safe",read(){return this.value}}});`,
		browser: false
	},
	{
		name: 'binding replacement browser-acquired-method',
		source: `function make(){return ({inner}:{inner:{read():string}})=>{const read=inner.read;inner={read(){return "safe"}};return read()}}export const value=[make()][0]!({inner:{read(){return document.title}}});`,
		browser: true
	},
	{
		name: 'evaluated data input',
		source: `function make(){return ({value}:{value:string})=>value}export const value=[make()][0]!({value:document.title});`,
		browser: true
	},
	{
		name: 'projected getter',
		source: `function make(){return ({value}:{value:string})=>value}export const value=[make()][0]!({get value(){return document.title}});`,
		browser: true
	},
	{
		name: 'unused getter binding',
		source: `function make(){return ({value}:{value:string})=>"safe"}export const value=[make()][0]!({get value(){return document.title}});`,
		browser: true,
		extras: { value: 'safe' }
	},
	{
		name: 'unused identifier',
		source: `function make(){return (input:{value:string})=>"safe"}export const value=[make()][0]!({get value(){return document.title}});`,
		browser: false
	},
	{
		name: 'direct declaration',
		source: `function read({value}:{value:string}){return value}export const value=read({get value(){return document.title}});`,
		browser: true
	},
	{
		name: 'object method',
		source: `const obj={read({value}:{value:string}){return value}};export const value=obj.read({get value(){return document.title}});`,
		browser: true
	},
	{
		name: 'nested object',
		source: `function make(){return ({inner:{value}}:{inner:{value:string}})=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: true
	},
	{
		name: 'bound member read',
		source: `function make(){return ({inner}:{inner:{value:string}})=>inner.value}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: true
	},
	{
		name: 'literal computed alias',
		source: `function make(){return ({["value"]:alias}:{value:string})=>alias}const obj={read:make()};const read=obj.read;export const value=read({get value(){return document.title}});`,
		browser: true
	},
	{
		name: 'missing nested default',
		source: `function make(){return ({inner={value:document.title}}:{inner?:{value:string}})=>inner.value}export const value=[make()][0]!({});`,
		browser: true
	},
	{
		name: 'explicit undefined default',
		source: `function make(){return ({value=document.title}:{value?:string})=>value}export const value=[make()][0]!({value:undefined});`,
		browser: true
	},
	{
		name: 'bypassed nested default',
		source: `function make(){return ({inner={value:document.title}}:{inner?:{value:string}})=>inner.value}export const value=[make()][0]!({inner:{value:"safe"}});`,
		browser: false
	},
	{
		name: 'unused rest getter',
		source: `function make(){return ({first,...rest}:{first:string;value:string})=>"safe"}export const value=[make()][0]!({first:"safe",get value(){return document.title}});`,
		browser: true,
		extras: { value: 'safe' }
	},
	{
		name: 'rest copy',
		source: `function make(){return ({first,...rest}:{first:string;value:string})=>rest.value}export const value=[make()][0]!({first:"safe",value:"safe"});`,
		browser: false
	},
	{
		name: 'callee argument binding and body order',
		source: `const log:string[]=[];function make(){return ({a="safe",b}:{a?:string;b:string})=>{log.push("body");return a}}const obj={get read(){log.push("callee");return make()}};function arg(){log.push("arg");return {get a(){log.push("a");return undefined},get b(){log.push("b");return "safe"}}}export const value=obj.read(arg());export const order=log.join(",");`,
		browser: false,
		extras: { order: 'callee,arg,a,b,body' },
		placement: 'unknown' as const
	},
	{
		name: 'getter exception stops later bindings and body',
		source: `const log:string[]=[];function make(){return ({a,b}:{a:string;b:string})=>{log.push("body");return a}}function arg(){log.push("arg");return {get a():string{log.push("a");throw new Error("stop")},get b(){log.push("b");return "safe"}}}function run(){try{return [make()][0]!(arg())}catch{log.push("catch");return "safe"}}export const value=run();export const order=log.join(",");`,
		browser: false,
		extras: { order: 'arg,a,catch' },
		placement: 'unknown' as const
	},
	{
		name: 'rest exclusion reads each getter once',
		source: `const log:string[]=[];function make(){return ({a,...rest}:{a:string;b:string})=>rest.b}export const value=[make()][0]!({get a(){log.push("a");return "safe"},get b(){log.push("b");return "safe"}});export const order=log.join(",");`,
		browser: false,
		extras: { order: 'a,b' }
	},
	{
		name: 'array literal keeps native iteration',
		source: `function make(){return ([value]:string[])=>value}export const value=[make()][0]!(["safe"]);`,
		browser: false,
		placement: 'unknown' as const
	},
	{
		name: 'custom iterator ignores numeric getter and closes before body',
		source: `const log:string[]=[];function make(){return ([value]:Iterable<string>)=>{log.push("body");return value}}const input={get 0(){return document.title},[Symbol.iterator](){log.push("iterator");return {next(){log.push("next");return {done:false,get value(){log.push("value");return "safe"}}},return(){log.push("return");return {done:true,value:"safe"}}}}};export const value=[make()][0]!(input);export const order=log.join(",");`,
		browser: false,
		placement: 'unknown' as const,
		extras: { order: 'iterator,next,value,return,body' }
	},
	{
		name: 'whole-default-unused',
		source: `function make(){return ({value}={get value(){return document.title}})=>"safe"}export const value=[make()][0]!();`,
		browser: true,
		extras: { value: 'safe' }
	},
	{
		name: 'whole-default-bypassed',
		source: `function make(){return ({value}={get value(){return document.title}})=>value}export const value=[make()][0]!({value:"safe"});`,
		browser: false
	},
	{
		name: 'nested-pattern-default',
		source: `function make(){return ({inner:{value}={get value(){return document.title}}}:{inner?:{value:string}})=>value}export const value=[make()][0]!({});`,
		browser: true
	},
	{
		name: 'rest-nested-browser',
		source: `function make(){return ({...rest}:{inner:{value:string}})=>rest.inner.value}export const value=[make()][0]!({inner:{get value(){return document.title}}});`,
		browser: true
	},
	{
		name: 'comma-input-browser',
		source: `function make(){return ({value}:{value:string})=>value}export const value=[make()][0]!((void 0,{get value(){return document.title}}));`,
		browser: true
	},
	{
		name: 'comma-input-safe',
		source: `function make(){return ({value}:{value:string})=>value}export const value=[make()][0]!((void 0,{value:"safe"}));`,
		browser: false
	},
	{
		name: 'computed-key-order',
		source: `const log:string[]=[];function make(){return ({[(log.push("key"),"value")]:alias}:{value:string})=>{log.push("body");return alias}}export const value=[make()][0]!({get value(){log.push("get");return "safe"}});export const order=log.join(",");`,
		browser: false,
		extras: { order: 'key,get,body' }
	},
	{
		name: 'false-default-bypass',
		source: `const log:string[]=[];function make(){return ({value=(log.push("default"),document.title)}:{value?:boolean|string})=>"safe"}export const value=[make()][0]!({value:false});export const order=log.join(",");`,
		browser: false,
		extras: { order: '' }
	},
	{
		name: 'empty-default-bypass',
		source: `const log:string[]=[];function make(){return ({value=(log.push("default"),document.title)}:{value?:string})=>"safe"}export const value=[make()][0]!({value:""});export const order=log.join(",");`,
		browser: false,
		extras: { order: '' }
	},
	{
		name: 'iterator-default-exception-closing',
		source: `const log:string[]=[];function fail():never{log.push("default");throw new Error("stop")}function make(){return ([value=fail()]:Iterable<string|undefined>)=>{log.push("body");return value}}const input={ [Symbol.iterator](){log.push("iterator");return {next(){log.push("next");return {done:false,value:undefined}},return(){log.push("return");return {done:true,value:undefined}}}}};function run(){try{return [make()][0]!(input)}catch{log.push("catch");return "safe"}}export const value=run();export const order=log.join(",");`,
		browser: false,
		extras: { order: 'iterator,next,default,return,catch' },
		placement: 'unknown' as const
	}
])('preserves parameter pattern evaluation for $name', assertOrdinaryModuleNamespaces);
