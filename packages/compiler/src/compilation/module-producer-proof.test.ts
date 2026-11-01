import { it } from 'vitest';
import { assertOrdinaryModuleNamespaces } from '../test-support/module-namespace.js';

// Rejecting an invalid producer proof must preserve the complete portable namespace.
// Broader unknown emission remains outside this bounded proof correction.
it.each([
	{
		name: 'label-break-opposite',
		source:
			'function make(){const obj={item:{value:"safe"}};done:{break done;obj.item={get value(){return document.title}}}return obj}export const value=make().item.value;',
		browser: false,
		placement: undefined
	},
	{
		name: 'break-taken',
		source:
			'function make(){const obj={item:{value:"safe"}};done:{if(true)break done;obj.item={get value(){return document.title}}}return obj}export const value=make().item.value;',
		browser: false,
		placement: undefined
	},
	{
		name: 'break-called-opposite',
		source:
			'const obj={item:{value:"safe"}};function write(){done:{break done;obj.item={get value(){return document.title}}}}write();export const value=obj.item.value;',
		browser: false,
		placement: undefined
	},
	{
		name: 'number-destructure-opposite',
		source:
			'({Number:globalThis.Number}={Number:(()=>0) as NumberConstructor});function make(){const obj={item:{get value(){return document.title}}};if(Number("1"))return obj;obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: false,
		placement: 'unknown' as const
	},
	{
		name: 'number-define-opposite',
		source:
			'Object.defineProperty(globalThis,"Number",{value:()=>0,configurable:true,writable:true});function make(){const obj={item:{get value(){return document.title}}};if(Number("1"))return obj;obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: false,
		placement: 'unknown' as const
	},
	{
		name: 'number-reflect-opposite',
		source:
			'Reflect.set(globalThis,"Number",()=>0);function make(){const obj={item:{get value(){return document.title}}};if(Number("1"))return obj;obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: false,
		placement: 'unknown' as const
	},
	{
		name: 'number-array',
		source:
			'[globalThis.Number]=[(()=>0) as NumberConstructor];function make(){const obj={item:{get value(){return document.title}}};if(Number("1"))return obj;obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: false,
		placement: 'unknown' as const
	},
	{
		name: 'number-shorthand',
		source:
			'({Number}={Number:(()=>0) as NumberConstructor});function make(){const obj={item:{get value(){return document.title}}};if(Number("1"))return obj;obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: false,
		placement: 'unknown' as const
	},
	{
		name: 'break-nested',
		source:
			'function make(){const obj={item:{value:"safe"}};outer:{inner:{break outer;obj.item={get value(){return document.title}}}}return obj}export const value=make().item.value;',
		browser: false,
		placement: undefined
	},
	{
		name: 'continue-skipped',
		source:
			'function make(){const obj={item:{value:"safe"}};for(let i=0;i<1;i++){continue;obj.item={get value(){return document.title}}}return obj}export const value=make().item.value;',
		browser: false,
		placement: 'unknown' as const
	},
	{
		name: 'finally-safe',
		source:
			'function make(){const obj={item:{value:"safe"}};try{done:{break done;obj.item={get value(){return document.title}}}}finally{}return obj}export const value=make().item.value;',
		browser: false,
		placement: undefined
	}
])('preserves portable exports for $name', async (test) => {
	await assertOrdinaryModuleNamespaces({
		...test,
		placement: test.placement
	});
});

// A label consumes only its own break. Writes after the exit remain performed.
it.each([
	{
		name: 'post-label performed browser write',
		source:
			'function make(){const obj={item:{value:"safe"}};done:{break done;}obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'inverse skipped portable replacement',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};done:{break done;obj.item={value:"safe"}}return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'nested break exits actual outer label',
		source:
			'function make(){const obj={item:{value:"safe"}};outer:{inner:{break outer;}obj.item={get value(){return document.title}}}return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'matching break bypasses later return',
		source:
			'function make(){const obj={item:{value:"safe"}};done:{break done;return obj;}obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'real return is not consumed by label',
		source:
			'function make(){const obj={item:{value:"safe"}};done:{return obj;}obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: false
	}
])('retains labeled completion namespaces for $name', async (test) => {
	await assertOrdinaryModuleNamespaces(test);
});

// Required finalizers share label reachability without changing old object aliases.
it.each([
	{
		name: 'local-finalizer-return',
		source:
			'function make(){try{return {get value(){return document.title}}}finally{done:{break done;}return {value:"safe"}}}export const value=make().value;',
		browser: false
	},
	{
		name: 'skipped-finalizer-write',
		source:
			'function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read}finally{done:{break done;inner={get value(){return document.title}}}}}export const value=make({inner:{value:"safe"}})();',
		browser: false
	},
	{
		name: 'post-label-finalizer-write',
		source:
			'function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read}finally{done:{break done;}inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}})();',
		browser: true
	},
	{
		name: 'old-alias-finalizer',
		source:
			'function make({inner}:{inner:{value:string}}){const old=inner;const read=()=>old.value;try{return read}finally{done:{break done;}inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}})();',
		browser: false
	}
])('preserves labeled finalizer observations for $name', async (test) => {
	await assertOrdinaryModuleNamespaces(test);
});
