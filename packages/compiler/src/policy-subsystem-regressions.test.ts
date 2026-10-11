import path from 'node:path';
import { expect, it } from 'vitest';
import { transform } from './index.js';
import { analyzeSource } from './compilation/source-analysis.js';

it('requires secret receipt for pattern defaults and computed selections at every target', () => {
	for (const target of [undefined, 'client', 'server'] as const)
		for (const [body, denied] of [
			['let value="";({value=credential}={});', true],
			['let value="";({entry:{value=credential}}={entry:{}});', true],
			['const {value=credential}:{value?:string}={};', true],
			['const helper=({value=credential}:{value?:string}={})=>void value;', true],
			['let value="";({[credential]:value}={public:"ok"});', true],
			['const {[credential]:value}:{[key:string]:string}={public:"ok"};', true],
			['let value:Secret<string>=credential;({value=credential}={});', false],
			['let value="";({value="public"}={});', false],
			['const helper=({value=credential}:{value?:Secret<string>}={})=>void value;', false]
		] as const) {
			const analysis = analyzeSource(
				`import type{Secret}from '@exactjs/secrets';declare const credential:Secret<string>;function work(){${body}}export function Page(){return()=> <p>Public</p>;}`,
				{ filename: path.resolve('.tmp/policy-pattern-regression.tsx'), target }
			);
			expect(
				analysis.diagnostics.some((message) => message.includes('secret assignment')),
				body
			).toBe(denied);
		}
});

it('preserves declared secret authority for computed native forwarders and public projections', () => {
	for (const target of ['client', 'server'] as const)
		for (const member of ['call', 'apply', 'bind']) {
			const args = member === 'apply' ? '[credential]' : 'credential';
			for (const qualified of [false, true]) {
				const source = `import type{Secret}from '@exactjs/secrets';declare const credential:Secret<string>;declare function helper<T>(value:${qualified ? 'Secret<T>' : 'T'}):void;export function work(){helper["${member}"](null,${args});}`;
				const options = { filename: path.resolve('.tmp/policy-forward-regression.ts'), target };
				if (qualified)
					expect(() =>
						transform(source, { ...options, generatedValidation: 'semantic' })
					).not.toThrow();
				else expect(() => transform(source, options)).toThrow(/EXACT3003/);
			}
		}
	for (const target of ['client', 'server'] as const)
		expect(() =>
			transform(
				`import type{Secret}from '@exactjs/secrets';declare const record:{label:string;credential:Secret<string>};export function Page(){const {['label']:label}=record;return()=> <p>{label}</p>;}`,
				{
					filename: path.resolve('.tmp/policy-projection-regression.tsx'),
					target,
					generatedValidation: 'semantic'
				}
			)
		).not.toThrow();
});

it('resolves native context factory identity and option syntax before assigning residency', () => {
	for (const [definition, call, options, server] of [
		[
			"import{createContext as context}from '@exactjs/core';",
			'context',
			'{"scope":"request"}',
			true
		],
		["import * as core from '@exactjs/core';", 'core["createContext"]', '{scope:"request"}', true],
		[
			"import{createContext}from '@exactjs/core';const context=createContext;",
			'context',
			'{scope:"application"}',
			true
		],
		[
			"import{createContext}from '@exactjs/core';",
			'createContext',
			'{label:"scope:\'request\'"}',
			false
		],
		[
			'function createContext(name:string,options:unknown){return {name};}',
			'createContext',
			'{scope:"request"}',
			false
		]
	] as const) {
		const analysis = analyzeSource(
			`${definition}const Token=${call}('token',${options});export function Page(this:{getContext(token:unknown):string}){const label=this.getContext(Token);return()=> <p>{label}</p>;}`,
			{ filename: path.resolve('.tmp/policy-context-regression.tsx') }
		);
		expect(analysis.components[0]?.placement === 'server', `${call} ${options}`).toBe(server);
	}
});

it('retains secret control in helper and accessor results before rendering or hydration', () => {
	for (const target of ['client', 'server'] as const)
		for (const [definition, expression] of [
			['function label(){if(credential)return "a";return "b";}', 'label()'],
			['function label(){if(credential)return;return "b";}', 'label()'],
			[
				'class RecordValue{get label(){if(credential)return "a";return "b";}}const record=new RecordValue();',
				'record.label'
			],
			['function loader(){if(credential)return "a";return "b";}const route={loader};', '"public"']
		] as const) {
			const source = `import type{Secret}from '@exactjs/secrets';declare const credential:Secret<string>;${definition}export function Page(){return()=> <p>{${expression}}</p>;}`;
			expect(() =>
				transform(source, { filename: path.resolve('.tmp/policy-return-regression.tsx'), target })
			).toThrow(/EXACT3020/);
		}
	for (const condition of ['publicCondition', 'consume(credential)'])
		expect(() =>
			transform(
				`import{consume,type Secret}from '@exactjs/secrets';declare const credential:Secret<string>;declare const publicCondition:boolean;function label(){if(${condition})return "a";return "b";}export function Page(){return()=> <p>{label()}</p>;}`,
				{
					filename: path.resolve('.tmp/policy-return-control.tsx'),
					target: 'server',
					generatedValidation: 'semantic'
				}
			)
		).not.toThrow();
});
