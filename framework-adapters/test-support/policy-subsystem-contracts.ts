import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDiagnosticFixture as build } from './compiler-diagnostic-build.js';
import { verifyPolicyContextOptions } from './policy-context-options.js';

/** Policy investigations have separate owned fixtures and time budgets for each contract family. */
export async function verifyPolicySubsystemContract(
	adapter: 'vite' | 'webpack' | 'bun',
	contract: 'receipts' | 'contexts' | 'returns' | 'console'
): Promise<void> {
	const workspace = fileURLToPath(new URL('../../', import.meta.url));
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/policy-adapter-'));
	try {
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/policy-subsystem', type: 'module', private: true })
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						module: 'ESNext',
						moduleResolution: 'Bundler',
						jsx: 'preserve',
						strict: true
					},
					include: ['*.ts', '*.tsx']
				})
			)
		]);
		if (contract === 'contexts') await verifyPolicyContextOptions(adapter, root);
		else if (contract === 'returns') await verifySecretControlledReturns(adapter, root);
		else if (contract === 'console') await verifyConsoleOwnership(adapter, root);
		else await verifyPatternReceipts(adapter, root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

/** Each native forwarding form and pattern input retains declared receipt authority. */
async function verifyPatternReceipts(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	for (const target of ['client', 'server'] as const)
		for (const [parameter, invocation, denied] of [
			['Secret<T>', 'helper["call"](null,credential)', false],
			['T', 'helper["call"](null,credential)', true],
			['Secret<T>', 'helper["apply"](null,[credential])', false],
			['T', 'helper["apply"](null,[credential])', true],
			['Secret<T>', 'helper["bind"](null,credential)', false],
			['T', 'helper["bind"](null,credential)', true],
			['Secret<T>', '(()=>{let value="";({value=credential}={});})()', true],
			['Secret<T>', '(()=>{const {value=credential}:{value?:string}={};void value;})()', true],
			['Secret<T>', '(()=>{let value="";({[credential]:value}={public:"ok"});})()', true],
			['Secret<T>', '(()=>{let value=credential;({value=credential}={});})()', false]
		] as const) {
			await writeFile(
				path.join(root, 'helper.ts'),
				`import type{Secret}from '@exactjs/secrets';export function helper<T>(value:${parameter}):void{void value;}`
			);
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import{TaskContext,type Component}from '@exactjs/core';import type{Secret}from '@exactjs/secrets';import{helper}from './helper.js';declare const credential:Secret<string>;export function Page(this:Component<{label:string}>){const run=(_task:TaskContext=TaskContext.server())=>{void ${invocation};};return()=> <button onClick={()=>run()}>{this.state.label}</button>;}`
			);
			await assertPolicyBuild(adapter, root, target, denied, 'EXACT3003');
		}
}

/** Sink identity rejects real logging and permits qualified private methods with similar names. */
async function verifyConsoleOwnership(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	for (const target of ['client', 'server'] as const)
		for (const [body, denied] of [
			['function work(console:{log(value:Secret<string>):void}){console.log(credential);}', false],
			[
				'function work(console:{log(value:string):void}){if(credential)console.log("public");}',
				false
			],
			['const logger=console;function work(){if(credential)logger.log("public");}', true],
			['const {log:write}=console;function work(){if(credential)write("public");}', true],
			[
				"import{log as write}from 'node:console';function work(){if(credential)write('public');}",
				true
			],
			['function work(){if(credential)console.log`public`;}', true]
		] as const) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import type{Secret}from '@exactjs/secrets';declare const credential:Secret<string>;${body}export function Page(){return()=> <p>Public</p>;}`
			);
			await assertPolicyBuild(adapter, root, target, denied, 'EXACT3020');
		}
}

/** Rejected builds must retain the compiler diagnostic rather than fail at a later bundler boundary. */
async function assertPolicyBuild(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string,
	target: 'client' | 'server',
	denied: boolean,
	code: string
) {
	let failure: unknown;
	try {
		await build(adapter, root, target);
	} catch (error) {
		failure = error;
	}
	if (denied) {
		assert.ok(failure, `${adapter}/${target} accepted protected policy input`);
		assert.ok(String(failure).includes(code), String(failure));
	} else assert.equal(failure, undefined, `${adapter}/${target} rejected a valid policy control`);
}
/** Secret-controlled public literals must remain protected across imported helper boundaries. */
async function verifySecretControlledReturns(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	for (const target of ['client', 'server'] as const)
		for (const condition of ['credential', 'publicCondition']) {
			await writeFile(
				path.join(root, 'helper.ts'),
				`import type{Secret}from '@exactjs/secrets';declare const credential:Secret<string>;declare const publicCondition:boolean;export function label(){if(${condition})return 'a';return 'b';}`
			);
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import{label}from './helper.js';export function Page(){return()=> <p>{label()}</p>;}`
			);
			let failure: unknown;
			try {
				await build(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			if (condition === 'credential') {
				assert.ok(failure, `${adapter}/${target} disclosed a secret-controlled return`);
				assert.match(String(failure), /EXACT3020/);
			} else
				assert.equal(
					failure,
					undefined,
					`${adapter}/${target} rejected a public-controlled result`
				);
		}
}
