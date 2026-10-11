import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { buildDiagnosticFixture as build } from './compiler-diagnostic-build.js';

/** Checks namespace ownership and every metadata union value through both adapter targets. */
export async function verifyEnhancementSourceContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string,
	contract: 'enhancement prefixes' | 'enhancement metadata unions' | 'enhancement helper contexts'
): Promise<void> {
	if (contract === 'enhancement helper contexts') {
		await writeFile(
			path.join(root, 'helper.ts'),
			`import {createContext,type Component} from '@exactjs/core';const Token=createContext<number>('private-probe');export function read(owner:Component<{}>){return owner.hasContext(Token)}`
		);
		for (const target of ['client', 'server'] as const) {
			for (const [setup, invocation] of [
				['', '(read).call(undefined,this)'],
				['const first=read;const alias=first;', 'alias.apply(undefined,[this])']
			]) {
				await writeFile(
					path.join(root, 'entry.tsx'),
					`import {read} from './helper.js';import type {Component} from '@exactjs/core';export function Page(this:Component<{}>){${setup}const available=${invocation};return()=> <output>{String(available)}</output>}`
				);
				await build(adapter, root, target);
			}
		}
		return;
	}

	await writeFile(
		path.join(root, 'implementation.tsx'),
		`import type {Child} from '@exactjs/core';
interface Props {
value?:number;
/** @exact analyzer-only */
hint?:'brief'|'full';
children?:Child;
}
export function Main(props:Props){return()=> <_>{props.children}</_>}`
	);
	await writeFile(
		path.join(root, 'facade.ts'),
		`export {Main as default} from './implementation.js' with {type:'exact-enhancement'};`
	);
	const cases =
		contract === 'enhancement prefixes'
			? [
					['', `const settings={'skin:value':1};`, 'EXACT6005'],
					[` with {type:'exact-enhancement'}`, `const settings={'skin:value':1};`, ''],
					['', `const settings:Record<string,string>={'data-label':'ordinary'};`, '']
				]
			: [
					[
						` with {type:'exact-enhancement'}`,
						`const settings=Math.random()>0.5?{'skin:hint':'brief' as const}:{'skin:hint':42};`,
						'EXACT6011'
					],
					[
						` with {type:'exact-enhancement'}`,
						`const settings=Math.random()>0.5?{'skin:hint':42}:{'skin:hint':'brief' as const};`,
						'EXACT6011'
					],
					[
						` with {type:'exact-enhancement'}`,
						`const settings=Math.random()>0.5?{'skin:hint':'brief' as const}:{'skin:hint':'full' as const};`,
						''
					]
				];
	for (const target of ['client', 'server'] as const) {
		for (const [attribute, setup, diagnostic] of cases) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import skin from './facade.js'${attribute};export function Page(){${setup}return()=> <div {...settings}/>}`
			);
			let failure: unknown;
			try {
				await build(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			if (diagnostic)
				assert.ok(
					String(failure).includes(diagnostic),
					`${adapter}/${target} lost ${diagnostic}: ${String(failure)}`
				);
			else assert.equal(failure, undefined, `${adapter}/${target} rejected a supported correction`);
		}
	}
}
