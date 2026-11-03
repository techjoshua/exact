/**
 * Ordered JSX recipes shared by source SDK and real adapter acceptance.
 * The process.platform donor retains its independent unresolved property Get.
 * Native __dirname controls separately exercise an exclusively server summary.
 */
const recipes = [
	{
		name: 'spreadBefore',
		tag: 'ComponentInputInvariance',
		attributes: '{...extra} read={browserRead}',
		placement: 'client',
		browser: true,
		server: false
	},
	{
		name: 'spreadAfter',
		tag: 'ComponentInputInvariance',
		attributes: 'read={browserRead} {...extra}',
		placement: 'unknown',
		browser: true,
		server: false
	},
	{
		name: 'explicitOverride',
		tag: 'ComponentInputInvariance',
		attributes: '{...{read:browserRead}} {...extra} read={safeRead}',
		placement: 'isomorphic',
		browser: false,
		server: false
	},
	{
		name: 'disjointLiteral',
		tag: 'ComponentInputInvariance',
		attributes: "read={browserRead} {...{title:'ignored'}}",
		placement: 'client',
		browser: true,
		server: false
	},
	{
		name: 'finiteOverride',
		tag: 'ComponentInputInvariance',
		attributes: '{...{read:browserRead}} {...{read:serverRead}}',
		placement: 'unknown',
		browser: false,
		server: true
	},
	{
		name: 'unknownKey',
		tag: 'ComponentInputInvariance',
		attributes: 'read={browserRead} {...{[key]:safeRead}}',
		placement: 'unknown',
		browser: true,
		server: false
	},
	{
		name: 'unknownKeyBrowser',
		tag: 'ComponentInputInvariance',
		attributes: 'read={safeRead} {...{[key]:browserRead}}',
		placement: 'unknown',
		browser: true,
		server: false
	},
	{
		name: 'unknownKeyServer',
		tag: 'ComponentInputInvariance',
		attributes: 'read={safeRead} {...{[key]:serverRead}}',
		placement: 'unknown',
		browser: false,
		server: true
	},
	{
		name: 'unknownKeyFinalWrite',
		tag: 'ComponentInputInvariance',
		attributes: '{...{[key]:browserRead}} read={safeRead}',
		placement: 'isomorphic',
		browser: false,
		server: false
	},
	{
		name: 'getterOverride',
		tag: 'ComponentInputInvariance',
		attributes: '{...{read:browserRead}} {...{get read(){return safeRead}}}',
		placement: 'unknown',
		browser: false,
		server: false
	},
	{
		name: 'serverBefore',
		tag: 'ComponentInputInvariance',
		attributes: '{...extra} read={serverRead}',
		placement: 'unknown',
		browser: false,
		server: true
	},
	{
		name: 'serverAfter',
		tag: 'ComponentInputInvariance',
		attributes: 'read={serverRead} {...extra}',
		placement: 'unknown',
		browser: false,
		server: true
	},
	{
		name: 'literalMethod',
		tag: 'ComponentInputInvariance',
		attributes: '{...{read(){return document.title}}}',
		placement: 'client',
		browser: true,
		server: false
	},
	{
		name: 'unknownKeyMethod',
		tag: 'ComponentInputInvariance',
		attributes: 'read={safeRead} {...{[key](){return document.title}}}',
		placement: 'unknown',
		browser: true,
		server: false
	},
	{
		name: 'dormantMethod',
		tag: 'DormantComponentInputInvariance',
		attributes: '{...{read(){return document.title}}}',
		placement: 'isomorphic',
		browser: false,
		server: false
	},
	{
		name: 'dormantSpread',
		tag: 'DormantComponentInputInvariance',
		attributes: 'read={browserRead} {...extra}',
		placement: 'isomorphic',
		browser: false,
		server: false
	}
] as const;

/** Original receiver annotations intentionally retain the formerly failing spelling. */
export const componentInputOverrideConsumers = recipes.map((recipe) => ({
	...recipe,
	source: `import {ComponentInputInvariance,type ComponentInputInvarianceProps}from './component-input-invariance.fixtures.js';
import {DormantComponentInputInvariance}from './component-input-invariance-dormant.fixtures.js';
const extra={title:'extra'};const key=String('other');
function browserRead(this:ComponentInputInvarianceProps,suffix:string){return this.label+suffix+document.title;}
function safeRead(this:ComponentInputInvarianceProps,suffix:string){return this.label+suffix;}
function serverRead(this:ComponentInputInvarianceProps,suffix:string){return this.label+suffix+process.platform;}
export function Parent(){return()=> <${recipe.tag} label="edge" ${recipe.attributes}/>;}`
}));

/** A spread reads its getter once without invoking a dormant browser callback. */
export const componentInputDormantGetterSource = `import {DormantComponentInputInvariance}from './component-input-invariance-dormant.fixtures.js';
import type {ComponentInputInvarianceProps}from './component-input-invariance.fixtures.js';
let gets=0,calls=0;
function browserRead(this:ComponentInputInvarianceProps,suffix:string){calls++;return this.label+suffix+document.title;}
const extra={get read(){gets++;return browserRead;}};
export function counters(){return {gets,calls};}
export function Parent(){return()=> <DormantComponentInputInvariance label="edge" {...extra}/>;}`;
