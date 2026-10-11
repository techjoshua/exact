import path from 'node:path';
import { expect, it } from 'vitest';
import { analyzeSource } from './compilation/source-analysis.js';

it('requires declared secret authority across generic and rest receipt contracts', () => {
	for (const target of [undefined, 'client', 'server'] as const) {
		for (const [definition, invocation, rejected] of [
			['declare function helper<T>(value:T):void;', 'helper(credential)', true],
			['declare function helper<T>(value:Secret<T>):void;', 'helper(credential)', false],
			[
				'declare function helper<T extends Secret<string>>(value:T):void;',
				'helper(credential)',
				false
			],
			[
				'declare function helper(...values:Secret<string>[]):void;',
				'helper(credential,credential)',
				false
			],
			[
				'declare function helper(...values:[string,Secret<string>]):void;',
				'helper("public",credential)',
				false
			],
			[
				'declare function helper(...values:[string,Secret<string>]):void;',
				'helper(credential,credential)',
				true
			],
			['declare class Helper<T>{constructor(value:T)}', 'new Helper(credential)', true],
			['declare class Helper<T>{constructor(value:Secret<T>)}', 'new Helper(credential)', false],
			[
				'declare function helper<T>(strings:TemplateStringsArray,value:T):void;',
				'helper`value:${credential}`',
				true
			],
			[
				'declare function helper<T>(strings:TemplateStringsArray,...values:Secret<T>[]):void;',
				'helper`first:${credential} second:${credential}`',
				false
			]
		] as const) {
			const analysis = analyzeSource(
				`import{TaskContext,type Component}from '@exactjs/core';import type{Secret}from '@exactjs/secrets';declare const credential:Secret<string>;${definition}export function Panel(this:Component<{label:string}>){const run=(_task:TaskContext=TaskContext.server())=>{void ${invocation};};return()=> <button onClick={()=>run()}>{this.state.label}</button>;}`,
				{ filename: path.resolve('.tmp/policy-declared-receipt.tsx'), target }
			);
			const errors = analysis.diagnostics.filter((message) => message.startsWith('error:'));
			if (rejected)
				expect(errors, invocation).toContainEqual(
					expect.stringContaining('secret argument requires an explicit Secret<T> parameter')
				);
			else expect(errors, invocation).toEqual([]);
		}
	}
});

it('retains native contextual secret parameters without qualifying public callbacks', () => {
	for (const target of [undefined, 'client', 'server'] as const) {
		for (const [parameter, body, rejected] of [
			['Secret<string>', 'console.log(value)', true],
			['Secret<string>', 'void consume(value)', false],
			['string', 'console.log(value)', false]
		] as const) {
			const analysis = analyzeSource(
				`import{TaskContext,type Component}from '@exactjs/core';import{consume,type Secret}from '@exactjs/secrets';declare function helper(callback:(value:${parameter})=>void):void;export function Panel(this:Component<{label:string}>){const run=(_task:TaskContext=TaskContext.server())=>helper(value=>{${body}});return()=> <button onClick={()=>run()}>{this.state.label}</button>;}`,
				{ filename: path.resolve('.tmp/policy-contextual-secret.tsx'), target }
			);
			const errors = analysis.diagnostics.filter((message) => message.startsWith('error:'));
			if (rejected)
				expect(errors).toContainEqual(
					expect.stringContaining(
						'secret-qualified value cannot influence secret-controlled console output'
					)
				);
			else expect(errors).toEqual([]);
		}
	}
});

it('checks forwarded and spread secret receipt against every declared position', () => {
	for (const target of [undefined, 'client', 'server'] as const) {
		for (const [definition, invocation, rejected] of [
			[
				'declare function helper(value:Secret<string>):void;',
				'helper.call(null,credential)',
				false
			],
			[
				'declare function helper(value:Secret<string>):void;',
				'helper.apply(null,[credential])',
				false
			],
			[
				'declare function helper(value:Secret<string>):void;',
				'helper.bind(null,credential)',
				false
			],
			['declare function helper<T>(value:T):void;', 'helper.call(null,credential)', true],
			['declare function helper<T>(value:T):void;', 'helper.apply(null,[credential])', true],
			['declare function helper<T>(value:T):void;', 'helper.bind(null,credential)', true],
			[
				'declare class Helper{constructor(value:Secret<string>)}',
				'Helper.bind(null,credential)',
				false
			],
			['declare class Helper{constructor(value:string)}', 'Helper.bind(null,credential)', true],
			['declare class Helper<T>{constructor(value:T)}', 'Helper.bind(null,credential)', true],
			[
				'declare const helper:{call(receiver:null,value:string):void};',
				'helper.call(null,credential)',
				true
			],
			[
				'declare function helper(...values:[Secret<string>,string]):void;declare const values:[Secret<string>,Secret<string>];',
				'helper(...values)',
				true
			],
			[
				'declare function helper(...values:[Secret<string>,Secret<string>]):void;declare const values:[Secret<string>,Secret<string>];',
				'helper(...values)',
				false
			],
			[
				'declare function helper(...values:Secret<string>[]):void;declare const values:Secret<string>[];',
				'helper(...values)',
				false
			],
			[
				'declare function helper(...values:[Secret<string>,string]):void;declare const values:Secret<string>[];',
				'helper(...values)',
				true
			],
			[
				'declare function helper(a:Secret<string>,b:Secret<string>,c:string):void;declare const values:[Secret<string>,Secret<string>];',
				'helper(...values,credential)',
				true
			],
			[
				'declare function helper(a:Secret<string>,b:Secret<string>,c:Secret<string>):void;declare const values:[Secret<string>,Secret<string>];',
				'helper(...values,credential)',
				false
			],
			[
				'declare function helper(a:Secret<string>,b:string):void;',
				'helper.apply(null,[credential,credential])',
				true
			],
			[
				'declare function helper(a:Secret<string>,b:Secret<string>):void;',
				'helper.apply(null,[credential,credential])',
				false
			]
		] as const) {
			const analysis = analyzeSource(
				`import{TaskContext,type Component}from '@exactjs/core';import type{Secret}from '@exactjs/secrets';declare const credential:Secret<string>;${definition}export function Panel(this:Component<{label:string}>){const run=(_task:TaskContext=TaskContext.server())=>{void ${invocation};};return()=> <button onClick={()=>run()}>{this.state.label}</button>;}`,
				{ filename: path.resolve('.tmp/policy-forwarded-receipt.tsx'), target }
			);
			const errors = analysis.diagnostics.filter((message) => message.startsWith('error:'));
			if (rejected)
				expect(errors, invocation).toContainEqual(
					expect.stringContaining('secret argument requires an explicit Secret<T> parameter')
				);
			else expect(errors, invocation).toEqual([]);
		}
	}
});

it('preserves secret binding leaves and defaults while permitting direct public siblings', () => {
	for (const target of [undefined, 'client', 'server'] as const) {
		for (const [definition, body, rejected] of [
			[
				'declare const record:{label:string,credential:Secret<string>};',
				'const {label}=record;console.log(label)',
				false
			],
			[
				'declare const record:{label:string,credential:Secret<string>};',
				'const {credential:value}=record;console.log(value)',
				true
			],
			[
				'declare const record:{label?:string,credential:Secret<string>};declare const credential:Secret<string>;',
				'const {label=credential}=record;console.log(label)',
				true
			],
			[
				'declare function helper(callback:(value:{credential:Secret<string>})=>void):void;',
				'helper(({credential:value})=>console.log(value))',
				true
			],
			[
				'declare function helper(callback:(value:{credential:Secret<string>})=>void):void;',
				'helper(({credential:value})=>void consume(value))',
				false
			]
		] as const) {
			const analysis = analyzeSource(
				`import{TaskContext,type Component}from '@exactjs/core';import{consume,type Secret}from '@exactjs/secrets';${definition}export function Panel(this:Component<{label:string}>){const run=(_task:TaskContext=TaskContext.server())=>{${body}};return()=> <button onClick={()=>run()}>{this.state.label}</button>;}`,
				{ filename: path.resolve('.tmp/policy-binding-receipt.tsx'), target }
			);
			const errors = analysis.diagnostics.filter((message) => message.startsWith('error:'));
			if (rejected) expect(errors, body).not.toEqual([]);
			else expect(errors, body).toEqual([]);
		}
	}
});

it('retains private receivers as client task execution requirements', () => {
	for (const target of [undefined, 'client', 'server'] as const) {
		const analysis = analyzeSource(
			`import{TaskContext,type Component}from '@exactjs/core';import type{Secret}from '@exactjs/secrets';declare const helper:{credential:Secret<string>,read():string};export function Panel(this:Component<{label:string}>){const run=(_task:TaskContext=TaskContext.client())=>{void helper.read()};return()=> <button onClick={()=>run()}>{this.state.label}</button>;}`,
			{ filename: path.resolve('.tmp/policy-receiver-execution.tsx'), target }
		);
		expect(analysis.diagnostics.filter((message) => message.startsWith('error:'))).not.toEqual([]);
	}
});

it('rejects secret erasure through assignment and iteration destinations', () => {
	for (const target of [undefined, 'client', 'server'] as const) {
		for (const [body, rejected] of [
			["let value='';value=credential;console.log(value)", true],
			["let value='';value+=credential;console.log(value)", true],
			["let value='';({credential:value}=record);console.log(value)", true],
			["let label='';({label}=record);console.log(label)", false],
			["let label='';({label=credential}=record);console.log(label)", true],
			[
				"const destination={value:''};destination.value=credential;console.log(destination.value)",
				true
			],
			['let value:Secret<string>=credential;value=credential;void consume(value)', false],
			['let value:Secret<string>=credential;value=credential;console.log(value)', true],
			["let value='';[value]=[credential];console.log(value)", true],
			['let value:Secret<string>=credential;[value]=[credential];void consume(value)', false],
			["let value='';[,value]=[credential,credential];console.log(value)", true],
			['let values:string[]=[];[...values]=[credential];console.log(values)', true],
			[
				'const destination:{value:Secret<string>}={value:credential};destination.value=credential;void consume(destination.value)',
				false
			],
			["let value='';({credential:value}=credential?record:record);console.log(value)", true],
			['for(const value of [credential])console.log(value)', true],
			['const helper=(value:string=credential)=>console.log(value);helper()', true],
			['const helper=(value:Secret<string>=credential)=>void consume(value);helper()', false],
			["const helper=(value:string='public')=>console.log(value);helper()", false],
			["let value='';value??=credential;console.log(value)", true],
			['try{throw credential}catch(error){console.log(error)}', true],
			['for(const value of [credential])void consume(value)', false],
			["let value='';for(value of [credential])console.log(value)", true],
			["for(const value of ['public'])console.log(value)", false],
			['for(const {label} of [record])console.log(label)', true],
			['for(const {credential:value} of [record])console.log(value)', true],
			['for(const key in privateValues)console.log(key)', true],
			["for(const key in {label:'public'})console.log(key)", false]
		] as const) {
			const analysis = analyzeSource(
				`import{TaskContext,type Component}from '@exactjs/core';import{consume,type Secret}from '@exactjs/secrets';declare const credential:Secret<string>;declare const record:{credential:Secret<string>;label:string};declare const privateValues:Secret<string>[];export function Panel(this:Component<{label:string}>){const run=(_task:TaskContext=TaskContext.server())=>{${body}};return()=> <button onClick={()=>run()}>{this.state.label}</button>;}`,
				{ filename: path.resolve('.tmp/policy-assignment-receipt.tsx'), target }
			);
			const errors = analysis.diagnostics.filter((message) => message.startsWith('error:'));
			if (rejected) expect(errors, body).not.toEqual([]);
			else expect(errors, body).toEqual([]);
		}
	}
});

it('protects secret-controlled writes across native operators and selectors', () => {
	for (const [body, rejected] of [
		["let value='';if(credential)value+='private';console.log(value)", true],
		['let value=0;if(credential)value++;console.log(value)', true],
		["let value='';while(credential){value='private';break;}console.log(value)", true],
		["let value='';switch(credential){case 'x':value='private';}console.log(value)", true],
		["let value='';credential&&(value='private');console.log(value)", true],
		["let value='';credential?(value='private'):(value='public');console.log(value)", true],
		["let value=0;if('public')value++;console.log(value)", false],
		["let value='';switch('public'){case 'public':value='public';}console.log(value)", false],
		[
			'let value:Secret<string>=credential;if(credential)value=credential;void consume(value)',
			false
		]
	] as const) {
		const analysis = analyzeSource(
			`import{TaskContext}from '@exactjs/core';import{consume,type Secret}from '@exactjs/secrets';declare const credential:Secret<string>;export function Panel(){const run=(_task:TaskContext=TaskContext.server())=>{${body}};return()=> <button onClick={()=>run()}>Public</button>;}`,
			{ filename: path.resolve('.tmp/policy-controlled-write.tsx'), target: 'server' }
		);
		const errors = analysis.diagnostics.filter((message) => message.startsWith('error:'));
		if (rejected) expect(errors, body).not.toEqual([]);
		else expect(errors, body).toEqual([]);
	}
});
