import { it } from 'vitest';
import { assertOrdinaryModuleNamespaces } from '../test-support/module-namespace.js';

// Each return occurrence owns its performed producers before alternatives join.
// Execute complete namespaces to catch both browser evaluation and lost portable values.
it.each([
	{
		name: 'early-return-browser',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};if(Number("1"))return obj;obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'early-browser-true',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};if(true)return obj;obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'early-browser-false',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};if(false)return obj;obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'early-safe-true',
		source:
			'function make(){const obj={item:{value:"safe"}};if(true)return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'early-safe-false',
		source:
			'function make(){const obj={item:{value:"safe"}};if(false)return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'early-return-safe',
		source:
			'function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'nested-safe-true',
		source:
			'function make(){const obj={item:{value:"safe"}};if(true){if(true)return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'else-safe-true',
		source:
			'function make(){const obj={item:{value:"safe"}};if(true){return obj}else{obj.item={get value(){return document.title}};return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'nested-browser-true',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};if(true){if(true)return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'else-browser-true',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};if(true){return obj}else{obj.item={value:"safe"};return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'nested-safe-false',
		source:
			'function make(){const obj={item:{value:"safe"}};if(false){if(true)return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'else-safe-false',
		source:
			'function make(){const obj={item:{value:"safe"}};if(false){return obj}else{obj.item={get value(){return document.title}};return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'nested-browser-false',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};if(false){if(true)return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'else-browser-false',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};if(false){return obj}else{obj.item={value:"safe"};return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'nested-safe-Number("1")',
		source:
			'function make(){const obj={item:{value:"safe"}};if(Number("1")){if(true)return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'else-safe-Number("1")',
		source:
			'function make(){const obj={item:{value:"safe"}};if(Number("1")){return obj}else{obj.item={get value(){return document.title}};return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'nested-browser-Number("1")',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};if(Number("1")){if(true)return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'else-browser-Number("1")',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};if(Number("1")){return obj}else{obj.item={value:"safe"};return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'nested-safe-Number("0")',
		source:
			'function make(){const obj={item:{value:"safe"}};if(Number("0")){if(true)return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'else-safe-Number("0")',
		source:
			'function make(){const obj={item:{value:"safe"}};if(Number("0")){return obj}else{obj.item={get value(){return document.title}};return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;',
		browser: true
	},
	{
		name: 'nested-browser-Number("0")',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};if(Number("0")){if(true)return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'else-browser-Number("0")',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};if(Number("0")){return obj}else{obj.item={value:"safe"};return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'conditional-safe-true',
		source:
			'const obj={item:{get value(){return document.title}}};if(true){obj.item={value:"safe"}}export const value=obj.item.value;',
		browser: false
	},
	{
		name: 'logical-true',
		source:
			'const obj={value:true?"":"safe"};obj.value||=document.title;export const value=obj.value;',
		browser: true
	},
	{
		name: 'conditional-safe-false',
		source:
			'const obj={item:{get value(){return document.title}}};if(false){obj.item={value:"safe"}}export const value=obj.item.value;',
		browser: true
	},
	{
		name: 'logical-false',
		source:
			'const obj={value:false?"":"safe"};obj.value||=document.title;export const value=obj.value;',
		browser: false
	},
	{
		name: 'conditional-safe-Number("1")',
		source:
			'const obj={item:{get value(){return document.title}}};if(Number("1")){obj.item={value:"safe"}}export const value=obj.item.value;',
		browser: false
	},
	{
		name: 'logical-Number("1")',
		source:
			'const obj={value:Number("1")?"":"safe"};obj.value||=document.title;export const value=obj.value;',
		browser: true
	},
	{
		name: 'conditional-safe-Number("0")',
		source:
			'const obj={item:{get value(){return document.title}}};if(Number("0")){obj.item={value:"safe"}}export const value=obj.item.value;',
		browser: true
	},
	{
		name: 'logical-Number("0")',
		source:
			'const obj={value:Number("0")?"":"safe"};obj.value||=document.title;export const value=obj.value;',
		browser: false
	},
	{
		name: 'early-read-before-write',
		source:
			'function make(){const obj={item:{value:"safe"}};const old=obj.item.value;if(false)return {item:{value:old}};obj.item={get value(){return document.title}};return {item:{value:old}}}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'conditional-safe',
		source:
			'const obj={item:{get value(){return document.title}}};if(Number("1"))obj.item={value:"safe"};export const value=obj.item.value;',
		browser: false
	},
	{
		name: 'logical-unknown-taken',
		source:
			'const obj={value:Number("1")?"":"safe"};obj.value||=document.title;export const value=obj.value;',
		browser: true
	},
	{
		name: 'old-return-object',
		source:
			'function make(){const obj={item:{value:"safe"}};const old=obj.item;if(false)return obj;obj.item={get value(){return document.title}};return {item:old}}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'early-read-before-write',
		source:
			'function make(){const obj={item:{value:"safe"}};const old=obj.item.value;if(false)return {item:{value:old}};obj.item={get value(){return document.title}};return {item:{value:old}}}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'dead-scalar-read',
		source:
			'function make(){if(false){return document.title}return "safe"}export const value=make();',
		browser: false
	},
	{
		name: 'dead-direct-call',
		source:
			'function read(){return document.title}function make(){if(false)return read();return "safe"}export const value=make();',
		browser: false
	},
	{
		name: 'conditional-expression-safe',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};if(false)return obj;obj.item={value:true?"safe":document.title};return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'logical-expression-safe',
		source:
			'function make(){const obj={item:{get value(){return document.title}}};if(false)return obj;obj.item={value:Number("1")&&"safe"||document.title};return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'logical-skip-before-return',
		source:
			'function make(){const obj={item:{value:"safe"}};if(true)return obj;obj.item.value||=document.title;return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'direct-conditional-write',
		source:
			'const obj={item:{get value(){return document.title}}};function write(){if(true)obj.item={value:"safe"}}write();export const value=obj.item.value;',
		browser: false
	},
	{
		name: 'dormant-return-write',
		source:
			'function make(){const obj={item:{value:"safe"}};function write(){if(true)obj.item={get value(){return document.title}}}return obj}export const value=make().item.value;',
		browser: false
	},
	{
		name: 'root-return-False-true',
		source:
			'function make(){let obj={value:"safe"};if(true)return obj;obj={get value(){return document.title}};return obj}export const value=make().value;',
		browser: false
	},
	{
		name: 'root-return-True-true',
		source:
			'function make(){let obj={get value(){return document.title}};if(true)return obj;obj={value:"safe"};return obj}export const value=make().value;',
		browser: true
	},
	{
		name: 'root-return-False-false',
		source:
			'function make(){let obj={value:"safe"};if(false)return obj;obj={get value(){return document.title}};return obj}export const value=make().value;',
		browser: true
	},
	{
		name: 'root-return-True-false',
		source:
			'function make(){let obj={get value(){return document.title}};if(false)return obj;obj={value:"safe"};return obj}export const value=make().value;',
		browser: false
	},
	{
		name: 'root-return-False-Number("1")',
		source:
			'function make(){let obj={value:"safe"};if(Number("1"))return obj;obj={get value(){return document.title}};return obj}export const value=make().value;',
		browser: false
	},
	{
		name: 'root-return-True-Number("1")',
		source:
			'function make(){let obj={get value(){return document.title}};if(Number("1"))return obj;obj={value:"safe"};return obj}export const value=make().value;',
		browser: true
	},
	{
		name: 'root-return-False-Number("0")',
		source:
			'function make(){let obj={value:"safe"};if(Number("0"))return obj;obj={get value(){return document.title}};return obj}export const value=make().value;',
		browser: true
	},
	{
		name: 'root-return-True-Number("0")',
		source:
			'function make(){let obj={get value(){return document.title}};if(Number("0"))return obj;obj={value:"safe"};return obj}export const value=make().value;',
		browser: false
	},
	{
		name: 'conditional-root-safe',
		source:
			'let obj={get value(){return document.title}};if(Number("1"))obj={value:"safe"};export const value=obj.value;',
		browser: false
	}
])('qualifies module producer branches for $name', assertOrdinaryModuleNamespaces);
