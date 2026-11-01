import { it } from 'vitest';
import { assertOrdinaryModuleNamespaces } from '../test-support/module-namespace.js';

type ReturnedCaptureTest = Parameters<typeof assertOrdinaryModuleNamespaces>[0] & { name: string };

// Live captures observe rebinding through invocation. Earlier aliases retain their
// acquired objects, and actual binding getters and defaults keep their effects.
it.each<ReturnedCaptureTest>([
	{
		name: 'returned capture direct-closure-False-before',
		source: `function read({inner}:{inner:{value:string}}){const get=()=>inner.value;inner={value:"safe"};return get}export const value=read({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'returned capture direct-closure-False-after',
		source: `function read({inner}:{inner:{value:string}}){inner={value:"safe"};const get=()=>inner.value;return get}export const value=read({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'returned capture returned-pattern-literal-arrow',
		source: `function read({inner}:{inner:{value:string}}){inner={value:"safe"};return ()=>inner.value}export const value=read({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'returned capture True-object-after',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={value:"safe"};return {read};}export const value=make({inner:{get value(){return document.title}}}).read();`,
		browser: false
	},
	{
		name: 'returned capture True-array-after',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={value:"safe"};return [read] as const;}export const value=make({inner:{get value(){return document.title}}})[0]();`,
		browser: false
	},
	{
		name: 'returned capture True-alias-after',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={value:"safe"};const alias=read;return alias;}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'returned capture False-direct-after',
		source: `function make(inner:{value:string}){const read=()=>inner.value;inner={value:"safe"};return read;}export const value=make({get value(){return document.title}})();`,
		browser: false
	},
	{
		name: 'returned capture True-old-alias-True',
		source: `function make({inner}:{inner:{value:string}}){const old=inner;const read=()=>old.value;inner={value:"safe"};return read}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: true
	},
	{
		name: 'returned capture True-old-alias-False',
		source: `function make({inner}:{inner:{value:string}}){const old=inner;const read=()=>old.value;inner={get value(){return document.title}};return read}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'returned capture True-invoke-before-True',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;const observed=read();inner={value:"safe"};return observed;}export const value=make({inner:{get value(){return document.title}}});`,
		browser: true
	},
	{
		name: 'returned capture True-invoke-before-False',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={value:"safe"};const observed=read();return observed;}export const value=make({inner:{get value(){return document.title}}});`,
		browser: false
	},
	{
		name: 'returned capture False-invoke-before-False',
		source: `function make(inner:{value:string}){const read=()=>inner.value;inner={value:"safe"};const observed=read();return observed;}export const value=make({get value(){return document.title}});`,
		browser: false
	},
	{
		name: 'returned capture local-identifier',
		source: `function make(input:{inner:{value:string}}){let alias=input.inner;const read=()=>alias.value;alias={value:"safe"};return read}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'returned capture local-binding-element',
		source: `function make(input:{inner:{value:string}}){let {inner:alias}=input;const read=()=>alias.value;alias={value:"safe"};return read}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'returned capture binding-getter',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={value:"safe"};return read}export const value=make({get inner(){document.title;return {value:"old"}}})();`,
		browser: true,
		extras: { value: 'safe' }
	},
	{
		name: 'returned capture default-effect',
		source: `function make({inner=(document.title,{value:"old"})}:{inner?:{value:string}}){const read=()=>inner.value;inner={value:"safe"};return read}export const value=make({})();`,
		browser: true,
		extras: { value: 'safe' }
	},
	{
		name: 'returned capture prefix-replacement',
		source: `function make({inner}:{inner:{nested:{value:string}}}){const old=inner.nested;const read=()=>old.value;inner.nested={value:"safe"};return read}export const value=make({inner:{nested:{get value(){return document.title}}}})();`,
		browser: true
	},
	{
		name: 'returned capture own-object-mutation',
		source: `function make({inner}:{inner:{value:string}}){const old=inner;const read=()=>old.value;old.value=document.title;return read}export const value=make({inner:{value:"old"}})();`,
		browser: true
	},
	{
		name: 'returned capture True-final-browser',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={get value(){return document.title}};return read}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'returned capture conditional-true',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;if(true)inner={value:"safe"};return read}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'returned capture conditional-false',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;if(false)inner={value:"safe"};return read}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: true
	},
	{
		name: 'returned capture two-writes',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={get value(){return document.title}};inner={value:"safe"};return read}export const value=make({inner:{value:"old"}})();`,
		browser: false
	},
	{
		name: 'returned capture own-call-default',
		source: `function make({inner}:{inner:{value:string}}){const read=(value=inner.value)=>value;inner={value:"safe"};return read}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: false
	}
])('preserves returned binding capture for $name', assertOrdinaryModuleNamespaces);

// The value chosen by return becomes observable after its enclosing finally.
// Ordinary invocation and alias acquisition inside the creator stay earlier.
it.each<ReturnedCaptureTest>([
	{
		name: 'completion comma-literal',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (inner={get value(){return document.title}},()=>inner.value)}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'completion finally-literal',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return ()=>inner.value}finally{inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'completion comma-named',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (inner={get value(){return document.title}},read)}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'completion finally-named',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read}finally{inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'completion comma-object',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (inner={get value(){return document.title}},{read})}export const value=make({inner:{value:"safe"}}).read();`,
		browser: true
	},
	{
		name: 'completion finally-object',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return {read}}finally{inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}}).read();`,
		browser: true
	},
	{
		name: 'completion comma-array',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (inner={get value(){return document.title}},[read] as const)}export const value=make({inner:{value:"safe"}})[0]();`,
		browser: true
	},
	{
		name: 'completion finally-array',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return [read] as const}finally{inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}})[0]();`,
		browser: true
	},
	{
		name: 'completion comma-local-identifier',
		source: `function make({inner}:{inner:{value:string}}){let alias=inner;const read=()=>alias.value;return(alias={get value(){return document.title}},read)}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'completion comma-identifier-formal',
		source: `function make(inner:{value:string}){const read=()=>inner.value;return(inner={get value(){return document.title}},read)}export const value=make({value:"safe"})();`,
		browser: true
	},
	{
		name: 'completion finally-local-identifier',
		source: `function make({inner}:{inner:{value:string}}){let alias=inner;const read=()=>alias.value;try{return read}finally{alias={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'completion finally-identifier-formal',
		source: `function make(inner:{value:string}){const read=()=>inner.value;try{return read}finally{inner={get value(){return document.title}}}}export const value=make({value:"safe"})();`,
		browser: true
	},
	{
		name: 'completion comma-statement-browser-control',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;(inner={get value(){return document.title}},read);return read}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'completion finally-prior-invocation-control',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read()}finally{inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}});`,
		browser: false
	},
	{
		name: 'completion finally-return-after-control',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{void 0}finally{inner={get value(){return document.title}}}return read}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'completion comma-helper-browser',
		source: `function identity<T>(x:T){return x}function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return identity((inner={get value(){return document.title}},read))}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'completion finally-old-alias',
		source: `function make({inner}:{inner:{value:string}}){const old=inner;try{return ()=>old.value}finally{inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'completion finally-override',
		source: `function make({inner}:{inner:{value:string}}){try{return ()=>inner.value}finally{return ()=>"safe"}}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'completion comma-old-alias',
		source: `function make({inner}:{inner:{value:string}}){const old=inner;const read=()=>old.value;return (inner={get value(){return document.title}},read)}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'completion finally-inert',
		source: `function make({inner}:{inner:{value:string}}){inner={value:"safe"};try{return ()=>inner.value}finally{void 0}}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'completion comma-safe',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return(inner={value:"safe"},read)}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'completion comma-after-literal-safe',
		source: `function make({inner}:{inner:{value:string}}){let read=()=>inner.value;return(read=()=>inner.value,inner={value:"safe"},read)}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'completion finally-safe',
		source: `function make({inner}:{inner:{value:string}}){try{return ()=>inner.value}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'completion finally-safe-object',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return {read}}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}}).read();`,
		browser: false
	},
	{
		name: 'completion finally-before-invoke',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read()}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}});`,
		browser: true
	},
	{
		name: 'completion finally-alias-safe',
		source: `function make({inner}:{inner:{value:string}}){const old=inner;try{return ()=>old.value}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: true
	},
	{
		name: 'completion nested-finally-safe',
		source: `function make({inner}:{inner:{value:string}}){try{try{return ()=>inner.value}finally{inner={get value(){return document.title}}}}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'completion nested-return-safe',
		source: `function make({inner}:{inner:{value:string}}){try{return ()=>()=>inner.value}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}})()();`,
		browser: false
	},
	{
		name: 'completion finally-member-browser',
		source: `function make({inner}:{inner:{value:string}}){const old=inner;try{return ()=>old.value}finally{old.value=document.title}}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'completion direct-independent-instances',
		source: `function make({inner}:{inner:{value:string}}){try{return ()=>inner.value}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}})();export const safeValue=make({inner:{value:"other"}})();`,
		browser: false,
		extras: { safeValue: 'safe' }
	},
	{
		name: 'completion finally-overrides-old-alias',
		source: `function make({inner}:{inner:{value:string}}){const old=inner;try{return ()=>inner.value}finally{inner={get value(){return document.title}};return ()=>old.value}}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	}
])('preserves capture completion for $name', assertOrdinaryModuleNamespaces);

// Completion observes only writes whose expression branch can execute.
it.each<ReturnedCaptureTest>([
	{
		name: 'reachability false-and',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (false&&(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'reachability true-or',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (true||(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'reachability nonnull-nullish',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;const test:string|null="kept";return (test??(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'reachability true-ternary',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (true?0:(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'reachability false-ternary',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (false?(inner={get value(){return document.title}}):0,read)}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'reachability true-and',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (true&&(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'reachability false-or',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (false||(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'reachability null-nullish',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;const test:string|null=null;return (test??(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'reachability false-and-portable',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (false&&(inner={value:"safe"}),read)}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: true
	},
	{
		name: 'reachability conditional-taken-browser',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (true?(inner={get value(){return document.title}}):0,read)}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	},
	{
		name: 'reachability unreachable-browser-then-safe',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return ((false&&(inner={get value(){return document.title}}),inner={value:"safe"}),read)}export const value=make({inner:{get value(){return document.title}}})();`,
		browser: false
	},
	{
		name: 'reachability logical-safe-before-finally',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return (false&&(inner={get value(){return document.title}}),read)}finally{void 0}}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'reachability false-and-finally',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read}finally{false&&(inner={get value(){return document.title}})}}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'reachability true-or-finally',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read}finally{true||(inner={get value(){return document.title}})}}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'reachability true-conditional-finally',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read}finally{true?0:(inner={get value(){return document.title}})}}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'reachability false-and-statement',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;false&&(inner={get value(){return document.title}});return read}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'reachability old-object-ignored-unreachable-rebind',
		source: `function make({inner}:{inner:{value:string}}){const old=inner;const read=()=>old.value;return(false&&(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`,
		browser: false
	},
	{
		name: 'reachability later-definite-browser-kept',
		source: `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return(false&&(inner={value:"safe"}),inner={get value(){return document.title}},read)}export const value=make({inner:{value:"safe"}})();`,
		browser: true
	}
])('preserves expression selection for $name', assertOrdinaryModuleNamespaces);
