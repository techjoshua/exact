import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { transform } from '../index.js';

const examples = [
	{
		name: 'render state mutation',
		code: 'EXACT_RENDER',
		reason: 'state',
		remedy: 'event handler',
		invalid: `import type {Component} from '@exactjs/core'; export function Page(this:Component<{count:number}>){return ()=> <button>{this.state.count++}</button>;}`,
		corrected: `import type {Component} from '@exactjs/core'; export function Page(this:Component<{count:number}>){return ()=> <button onClick={()=>this.state.count++}>{this.state.count}</button>;}`
	},
	{
		name: 'registry ownership',
		code: 'EXACT_COMPONENT_REGISTRY',
		reason: 'module-level',
		remedy: 'const Registry',
		invalid: `import {createComponentRegistry} from '@exactjs/core'; function Card(){return ()=> <p/>;} export function Page(){const Registry=createComponentRegistry(()=>({card:Card}));return ()=> <Registry.card/>;}`,
		corrected: `import {createComponentRegistry} from '@exactjs/core'; function Card(){return ()=> <p/>;} const Registry=createComponentRegistry(()=>({card:Card})); export function Page(){return ()=> <Registry.card/>;}`
	},
	{
		name: 'raw markup property',
		code: 'EXACT_NATIVE_PROP',
		reason: 'innerHTML',
		remedy: 'unsafeHtml',
		invalid: `export function Page(props:{text:string}){return ()=> <p innerHTML={props.text}/>;}`,
		corrected: `export function Page(props:{text:string}){return ()=> <p>{props.text}</p>;}`
	},
	{
		name: 'missing component import',
		code: 'EXACT2201',
		reason: 'Missing',
		remedy: 'Import or declare',
		invalid: `export function Page(){return ()=> <Missing/>;}`,
		corrected: `function Missing(){return ()=> <p/>;} export function Page(){return ()=> <Missing/>;}`
	},
	{
		name: 'conflicting progress policy',
		code: 'EXACT2001',
		reason: 'latest()',
		remedy: 'Remove those policy facets',
		invalid: `import {TaskContext} from '@exactjs/core'; export function Page(){function receive(value:string,task:TaskContext=TaskContext.client().progress().latest()){console.log(value);} return ()=> <button onClick={()=>receive('ready')}/>;}`,
		corrected: `import {TaskContext} from '@exactjs/core'; export function Page(){function receive(value:string,task:TaskContext=TaskContext.client().progress()){console.log(value);} return ()=> <button onClick={()=>receive('ready')}/>;}`
	}
];

describe('compiler diagnostic corrections', () => {
	it.each(examples)(
		'$name identifies the problem and a supported correction',
		({ name, code, reason, remedy, invalid, corrected }) => {
			const options = { filename: path.resolve(`.tmp/guidance-${name.replaceAll(' ', '-')}.tsx`) };
			let failure: unknown;
			try {
				transform(invalid, options);
			} catch (error) {
				failure = error;
			}
			expect(failure).toBeInstanceOf(Error);
			expect(String(failure)).toContain(code);
			expect(String(failure)).toContain(reason);
			expect(String(failure)).toContain(remedy);
			expect(() => transform(corrected, options)).not.toThrow();
		}
	);
});
