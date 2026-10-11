import path from 'node:path';
import { expect, it } from 'vitest';
import { transform } from './index.js';
import { analyzeSource } from './compilation/source-analysis.js';
import { createTestWorkspace, writeTestFiles } from './test-support/workspace.js';

it('protects imported and callable-variable secret results at every component output target', async () => {
	const root = await createTestWorkspace('.exact-policy-call-results-', path.resolve('.tmp'));
	await writeTestFiles(root, {
		'provider.d.ts': `import type {Secret} from '@exactjs/secrets';
		 export type Credential = Secret<string>;
		 export declare function readSecret(): Credential;
		 export declare function readPublic(): string;
		 export declare const readValue: () => Credential;
		 export declare function select(mode:'public'):string;
		 export declare function select(mode:'private'):Credential;`,
		'reexport.d.ts': `export {readSecret as read} from './provider.js';`
	});
	for (const target of [undefined, 'client', 'server'] as const) {
		for (const [declaration, expression] of [
			[`import {readSecret} from './provider.js';`, 'readSecret()'],
			[`import {readSecret} from './provider.js';const selected=readSecret;`, 'selected()'],
			[`import * as provider from './provider.js';`, 'provider.readSecret()'],
			[`import {read} from './reexport.js';`, 'read()'],
			[`import {readValue} from './provider.js';`, 'readValue()'],
			[
				`import type {Credential} from './provider.js';declare const read:()=>Credential;`,
				'read()'
			],
			[`import {select} from './provider.js';`, `select('private')`]
		]) {
			const analysis = analyzeSource(
				`${declaration}export function Panel(){return()=> <p>{${expression}}</p>;}`,
				{ filename: path.join(root, 'panel.tsx'), target }
			);
			expect(analysis.diagnostics, `${target}:${expression}`).toContainEqual(
				expect.stringContaining('secret-qualified value cannot influence operation output')
			);
		}
		for (const expression of ['readPublic()', `select('public')`, 'label']) {
			const analysis = analyzeSource(
				`import {readPublic,select} from './provider.js';const label=select('public');
				export function Panel(){return()=> <p>{${expression}}</p>;}`,
				{ filename: path.join(root, 'panel.tsx'), target }
			);
			expect(analysis.diagnostics, `${target}:${expression}`).toEqual([]);
			expect(analysis.components[0].placement).toBe('isomorphic');
		}
	}
});

it('keeps identically named callable returns separate across receivers', () => {
	const prefix = `import type {Secret} from '@exactjs/secrets';
	declare const privateService:{read():Secret<string>};
	declare const publicService:{read():string};
	const privateValue=privateService.read();const publicValue=publicService.read();`;
	for (const [expression, protectedValue] of [
		['privateValue', true],
		['publicValue', false]
	] as const) {
		const analysis = analyzeSource(
			`${prefix}export function Panel(){return()=> <p>{${expression}}</p>;}`,
			{ filename: path.resolve('.tmp/policy-call-receivers.tsx'), target: 'server' }
		);
		if (protectedValue)
			expect(analysis.diagnostics).toContainEqual(
				expect.stringContaining('secret-qualified value cannot influence operation output')
			);
		else expect(analysis.diagnostics).toEqual([]);
	}
});

it('retains explicit imported secret annotations even when the native return type is ordinary', async () => {
	const root = await createTestWorkspace('.exact-policy-call-annotations-', path.resolve('.tmp'));
	await writeTestFiles(root, {
		'provider.d.ts': `/** @exact keep=secret */
		 export declare function read(): string;`
	});
	const analysis = analyzeSource(
		`import {read} from './provider.js';export function Panel(){return()=> <p>{read()}</p>;}`,
		{ filename: path.join(root, 'panel.tsx'), target: 'server' }
	);
	expect(analysis.diagnostics).toContainEqual(
		expect.stringContaining('secret-qualified value cannot influence operation output')
	);
});

it('preserves public projections of recursive secret-bearing callable results', () => {
	const declarations = `import type {Secret} from '@exactjs/secrets';
	interface RecordValue{next?:RecordValue;label:string;credential:Secret<string>}
	declare function readRecord():RecordValue;
	declare function readNext():RecordValue|undefined;
	declare function readQualified():Secret<RecordValue>;
	/** @exact keep=secret */ declare function readAnnotated():RecordValue;`;
	for (const target of [undefined, 'client', 'server'] as const) {
		for (const expression of [
			'readRecord().label',
			'readRecord()["label"]',
			'readRecord().next?.label',
			'readNext()?.label'
		]) {
			const analysis = analyzeSource(
				`${declarations}export function Panel(){return()=> <p>{${expression}}</p>;}`,
				{ filename: path.resolve('.tmp/policy-result-projection.tsx'), target }
			);
			expect(
				analysis.diagnostics.filter((message) => message.startsWith('error:')),
				expression
			).toEqual([]);
		}
		for (const expression of [
			'JSON.stringify(readRecord())',
			'JSON.stringify(readNext())',
			'readRecord().credential',
			'readQualified().label',
			'readAnnotated().label'
		]) {
			const analysis = analyzeSource(
				`${declarations}export function Panel(){return()=> <p>{${expression}}</p>;}`,
				{ filename: path.resolve('.tmp/policy-result-projection.tsx'), target }
			);
			expect(analysis.diagnostics, expression).toContainEqual(
				expect.stringContaining('secret-qualified value cannot influence operation output')
			);
		}
	}
});

it('keeps secret type contracts authoritative over declaration placement annotations', async () => {
	const root = await createTestWorkspace(
		'.exact-policy-qualification-annotations-',
		path.resolve('.tmp')
	);
	await writeTestFiles(root, {
		'provider.d.ts': `import type {Secret} from '@exactjs/secrets';
/** @exact shared */
export declare function read():Secret<string>;
export interface Service{
/** @exact shared */
read():Secret<string>;
/** @exact shared */
value:Secret<string>;
}
export declare const service:Service;
/** @exact shared */
export declare function select(mode:'public'):string;
export declare function select(mode:'private'):Secret<string>;`
	});
	for (const target of [undefined, 'client', 'server'] as const) {
		for (const annotation of ['shared', 'keep=client', 'keep=server']) {
			for (const [declaration, expression] of [
				[`declare const value:Secret<string>;`, 'value'],
				[`declare function read():Secret<string>;`, 'read()'],
				[`declare const read:()=>Secret<string>;`, 'read()'],
				[
					`interface Inputs{\n/** @exact ${annotation} */\nvalue:Secret<string>}declare const input:Inputs;`,
					'input.value'
				]
			]) {
				const analysis = analyzeSource(
					`import type {Secret} from '@exactjs/secrets';\n/** @exact ${annotation} */\n${declaration}
export function Panel(){return()=> <p>{${expression}}</p>;}`,
					{ filename: path.join(root, 'panel.tsx'), target }
				);
				expect(analysis.diagnostics, `${target}:${annotation}:${expression}`).toContainEqual(
					expect.stringContaining('secret-qualified value cannot influence operation output')
				);
			}
		}
		for (const expression of ['read()', 'service.read()', 'service.value', `select('private')`]) {
			const analysis = analyzeSource(
				`import {read,service,select} from './provider.js';export function Panel(){return()=> <p>{${expression}}</p>;}`,
				{ filename: path.join(root, 'panel.tsx'), target }
			);
			expect(analysis.diagnostics, `${target}:${expression}`).toContainEqual(
				expect.stringContaining('secret-qualified value cannot influence operation output')
			);
		}
		const publicResult = analyzeSource(
			`/** @exact shared */\ndeclare function read():string;
export function Panel(){return()=> <p>{read()}</p>;}`,
			{ filename: path.join(root, 'panel.tsx'), target }
		);
		expect(publicResult.diagnostics).toEqual([]);
		const publicOverload = analyzeSource(
			`import {select} from './provider.js';export function Panel(){return()=> <p>{select('public')}</p>;}`,
			{ filename: path.join(root, 'panel.tsx'), target }
		);
		expect(publicOverload.diagnostics).toEqual([]);
	}
});

it('protects imported accessor values and literal member names without qualifying public siblings', async () => {
	const root = await createTestWorkspace('.exact-policy-accessors-', path.resolve('.tmp'));
	await writeTestFiles(root, {
		'provider.d.ts': `import type {Secret} from '@exactjs/secrets';
export declare class Service{
 get token():Secret<string>;
 get label():string;
 /** @exact shared */
 "credential":Secret<string>;
}
export declare const service:Service;`,
		'inferred.ts': `import type {Secret} from '@exactjs/secrets';
declare const credential:Secret<string>;
export const service={get token(){return credential},get label(){return 'Public'}};`
	});
	for (const target of [undefined, 'client', 'server'] as const) {
		for (const module of ['provider', 'inferred']) {
			for (const [expression, protectedValue] of [
				['service.token', true],
				['service["token"]', true],
				['service.label', false]
			] as const) {
				const analysis = analyzeSource(
					`import {service} from './${module}.js';export function Panel(){return()=> <p>{${expression}}</p>;}`,
					{ filename: path.join(root, 'panel.tsx'), target }
				);
				if (protectedValue)
					expect(analysis.diagnostics).toContainEqual(
						expect.stringContaining('secret-qualified value cannot influence operation output')
					);
				else expect(analysis.diagnostics).toEqual([]);
			}
		}
		const literal = analyzeSource(
			`import {service} from './provider.js';export function Panel(){return()=> <p>{service.credential}</p>;}`,
			{ filename: path.join(root, 'panel.tsx'), target }
		);
		expect(literal.diagnostics).toContainEqual(
			expect.stringContaining('declaration annotation cannot release secret-qualified data')
		);
	}
});

it('preserves selected generic result and member qualification across public and private instances', async () => {
	const root = await createTestWorkspace('.exact-policy-generic-selection-', path.resolve('.tmp'));
	await writeTestFiles(root, {
		'provider.d.ts': `import type {Secret} from '@exactjs/secrets';
export declare function read<T>():T;
export declare function identity<T>(value:T):T;
export declare function factory():()=>Secret<string>;
export declare function publicFactory():()=>string;
export declare function record<T>():{credential:T;label:string};
export declare function conditional<T extends boolean>(value:T):T extends true?Secret<string>:string;
export declare class Service<T>{read():T;get value():T;field:T;}
export declare const privateService:Service<Secret<string>>;
export declare const publicService:Service<string>;`
	});
	const declarations = `import type {Secret} from '@exactjs/secrets';
import {read,identity,factory,publicFactory,record,conditional,privateService,publicService} from './provider.js';
declare const credential:Secret<string>;`;
	for (const target of [undefined, 'client', 'server'] as const) {
		for (const [expression, protectedValue] of [
			['read<Secret<string>>()', true],
			['identity(credential)', true],
			['factory()()', true],
			['conditional(true)', true],
			['privateService.read()', true],
			['privateService.value', true],
			['privateService.field', true],
			['record<Secret<string>>().credential', true],
			['read<string>()', false],
			['publicFactory()()', false],
			['conditional(false)', false],
			['publicService.read()', false],
			['publicService.value', false],
			['publicService.field', false],
			['record<Secret<string>>().label', false]
		] as const) {
			const first = protectedValue
				? 'void read<string>();void publicService.read();void publicService.value;void publicService.field;'
				: 'void read<Secret<string>>();void privateService.read();void privateService.value;void privateService.field;';
			const analysis = analyzeSource(
				`${declarations}function prime(){${first}}export function Panel(){return()=> <p>{${expression}}</p>;}`,
				{ filename: path.join(root, 'panel.tsx'), target }
			);
			if (protectedValue)
				expect(analysis.diagnostics, `${target}:${expression}`).toContainEqual(
					expect.stringContaining('secret-qualified value cannot influence operation output')
				);
			else expect(analysis.diagnostics, `${target}:${expression}`).toEqual([]);
		}
	}
});

it('protects native constructor and tagged-template result contracts', () => {
	const declarations = `import type {Secret} from '@exactjs/secrets';
declare function tag(strings:TemplateStringsArray):Secret<string>;
declare function publicTag(strings:TemplateStringsArray):string;
declare const Maker:{new():Secret<{value:string}>};
declare const PublicMaker:{new():{value:string}};
declare const service:{tag(strings:TemplateStringsArray):Secret<string>};`;
	for (const target of [undefined, 'client', 'server'] as const) {
		for (const [expression, protectedValue] of [
			['tag`value`', true],
			['service.tag`value`', true],
			['JSON.stringify(new Maker())', true],
			['publicTag`value`', false],
			['JSON.stringify(new PublicMaker())', false]
		] as const) {
			const analysis = analyzeSource(
				`${declarations}export function Panel(){return()=> <p>{${expression}}</p>;}`,
				{ filename: path.resolve('.tmp/policy-invocation-result.tsx'), target }
			);
			if (protectedValue)
				expect(analysis.diagnostics).toContainEqual(
					expect.stringContaining('secret-qualified value cannot influence operation output')
				);
			else expect(analysis.diagnostics).toEqual([]);
		}
	}
});

it('authorizes secret constructor arguments and tag substitutions at their native parameter positions', () => {
	for (const target of [undefined, 'client', 'server'] as const) {
		for (const [definition, invocation, rejected] of [
			['declare class Consumer{constructor(value:string)}', 'new Consumer(credential)', true],
			[
				'declare class Consumer{constructor(value:Secret<string>)}',
				'new Consumer(credential)',
				false
			],
			[
				'declare function tag(strings:TemplateStringsArray,value:string):void;',
				'tag`value:${credential}`',
				true
			],
			[
				'declare function tag(strings:TemplateStringsArray,value:Secret<string>):void;',
				'tag`value:${credential}`',
				false
			],
			[
				'declare function tag(strings:TemplateStringsArray,label:string,value:Secret<string>):void;',
				'tag`label:${"public"} value:${credential}`',
				false
			],
			[
				'declare function tag(strings:TemplateStringsArray,value:string,label:Secret<string>):void;',
				'tag`value:${credential} label:${credential}`',
				true
			]
		] as const) {
			const analysis = analyzeSource(
				`import {TaskContext,type Component} from '@exactjs/core';import type {Secret} from '@exactjs/secrets';
declare const credential:Secret<string>;${definition}
export function Panel(this:Component<{label:string}>){const run=(_task:TaskContext=TaskContext.server())=>{void ${invocation};};return()=> <button onClick={()=>run()}>{this.state.label}</button>;}`,
				{ filename: path.resolve('.tmp/policy-invocation-arguments.tsx'), target }
			);
			if (rejected)
				expect(analysis.diagnostics, invocation).toContainEqual(
					expect.stringContaining('secret argument requires an explicit Secret<T> parameter')
				);
			else
				expect(
					analysis.diagnostics.filter((message) => message.startsWith('error:')),
					invocation
				).toEqual([]);
		}
	}
});

it('keeps inline values out of qualified result identity metadata', () => {
	const canary = 'PRIVATE-METADATA-CANARY';
	for (const target of [undefined, 'client', 'server'] as const) {
		const analysis = analyzeSource(
			`import{TaskContext,type Component}from '@exactjs/core';import{consume,type Secret}from '@exactjs/secrets';
declare function factory(value:string):()=>Secret<string>;
export function Panel(this:Component<{label:string}>){const run=(_task:TaskContext=TaskContext.server())=>{void consume(factory('${canary}')());};return()=> <button onClick={()=>run()}>{this.state.label}</button>;}`,
			{ filename: path.resolve('.tmp/policy-result-metadata.tsx'), target }
		);
		expect(analysis.diagnostics.filter((message) => message.startsWith('error:'))).toEqual([]);
		expect(analysis.policy.subjects.some((subject) => subject.policy.secret)).toBe(true);
		expect(JSON.stringify(analysis.policy)).not.toContain(canary);
	}
});

it('checks source-owned results after an earlier reference without eagerly consuming function values', async () => {
	const root = await createTestWorkspace('.exact-policy-deferred-results-', path.resolve('.tmp'));
	await writeTestFiles(root, {
		'provider.ts': `/** @exact keep=secret */ declare const credential:string;
export function read(){if(credential)return 'private';return 'other';}
export const readAlias=()=>{if(credential)return 'private';return 'other';};
export function readPublic(){return 'public';}
export class RecordValue{get label(){if(credential)return 'private';return 'other';}}
export const record=new RecordValue();`
	});
	for (const target of ['client', 'server'] as const) {
		for (const expression of [
			'(provider.read,provider.read())',
			'(provider.readAlias,provider.readAlias())',
			'provider.record.label'
		]) {
			expect(() =>
				transform(
					`import * as provider from './provider.js';export function Panel(){return()=> <p>{${expression}}</p>;}`,
					{ filename: path.join(root, 'panel.tsx'), target }
				)
			).toThrow(/EXACT3020/);
		}
		const result = transform(
			`import * as provider from './provider.js';export function Panel(){return()=> <p>{(provider.readPublic,provider.readPublic())}</p>;}`,
			{ filename: path.join(root, 'panel.tsx'), target, generatedValidation: 'semantic' }
		);
		expect(result).toContain('readPublic');
	}
});
