import { expect, it, onTestFinished } from 'vitest';
import { readExactEnhancementContexts } from '@exactjs/core';
import type { AnyComponentFunction, ContextToken } from '@exactjs/core';
import path from 'node:path';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { importArtifact } from '../test-support/import-artifact.js';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';
import { privateHelperArtifact } from '../test-support/private-helper-artifact.js';

for (const target of ['client', 'server'] as const)
	for (const name of ['Object', 'Symbol'] as const)
		it(`preserves enhancement metadata with authored ${name} (${target})`, async () => {
			const shadow =
				name === 'Object'
					? 'const Object={freeze(){throw new Error("authored freeze");},defineProperty(){throw new Error("authored attachment");}};void Object;'
					: 'const Symbol={for(){throw new Error("authored symbol");}};void Symbol;';
			const { compiled } = await privateHelperArtifact(
				`import {createContext,type Component} from '@exactjs/core';${shadow}
export function Page(this:Component<{}>){this.setContext(Token,1);return()=> 'ready';}
export const Token=createContext<number>('probe');`,
				target
			);
			const Page = compiled.Page as AnyComponentFunction;
			const Token = compiled.Token as ContextToken<number>;
			const contract = readExactEnhancementContexts(Page)!;
			expect(Page.name).toBe('Page');
			expect(contract.provides).toEqual([Token.id]);
			expect(contract.requires).toEqual([]);
			expect(contract.optionallyConsumes).toEqual([]);
			expect(Object.isFrozen(contract)).toBe(true);
			for (const field of ['provides', 'requires', 'optionallyConsumes'] as const)
				expect(Object.isFrozen(contract[field])).toBe(true);
			expect(
				Object.getOwnPropertyDescriptor(Page, Symbol.for('@exactjs/enhancement-contexts'))
			).toEqual({
				value: contract,
				configurable: false,
				writable: false,
				enumerable: false
			});
		});

for (const target of ['client', 'server'] as const)
	it(`retains invalid enhancement context value diagnostics (${target})`, () => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const result = compiler.request({
			kind: 'compile',
			target,
			root: process.cwd(),
			diagnostics: 'semantic',
			id: path.resolve('.tmp/compiler-confidence/invalid-enhancement-value.ts'),
			source: `import {createContext,type Component} from '@exactjs/core';
const Object={freeze(){throw new Error('authored freeze');},defineProperty(){throw new Error('authored attachment');}};void Object;
const Token=createContext<number>('probe');
export function Page(this:Component<{}>){this.setContext(Token,'wrong');return()=> 'ready';}`
		});
		expect(result.error).toBeUndefined();
		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics![0]).toMatchObject({ code: 'TS2345', severity: 'error' });
		expect(result.diagnostics![0]!.message).toContain("'string'");
	});

for (const target of ['client', 'server'] as const)
	it(`retains transitive enhancement tokens with authored Reflect (${target})`, async () => {
		const parent = path.resolve('.tmp/task-private-routing');
		await mkdir(parent, { recursive: true });
		const directory = await mkdtemp(path.join(parent, 'enhancement-'));
		onTestFinished(() => rm(directory, { recursive: true, force: true }));
		const configFile = path.join(directory, 'tsconfig.json');
		await writeFile(
			configFile,
			JSON.stringify({
				compilerOptions: {
					noUnusedLocals: true,
					strict: true,
					module: 'ESNext',
					moduleResolution: 'Bundler',
					target: 'ES2022'
				}
			})
		);
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const context =
			"import {createContext} from '@exactjs/core';export const Token=createContext<number>('probe');";
		const helper = `import type {Component} from '@exactjs/core';import {Token} from './context.js';
const Object={freeze(){throw new Error('authored freeze');},defineProperty(){throw new Error('authored attachment');}};void Object;
export function provide(owner:Component<{}>){owner.setContext(Token,1);}`;
		const page = `import type {Component} from '@exactjs/core';import {provide} from './helper.js';export {Token} from './context.js';
const Reflect={get(){throw new Error('authored dependency read');}};void Reflect;
export function Page(this:Component<{}>){provide(this);return()=> 'ready';}`;
		await Promise.all(
			[
				['context', context],
				['helper', helper],
				['page', page]
			].map(([name, source]) => writeFile(path.join(directory, name + '.ts'), source!))
		);
		const results = ['helper', 'page'].map((name) => {
			const result = compiler.request({
				kind: 'compile',
				configFile,
				target,
				root: process.cwd(),
				diagnostics: 'semantic',
				id: path.join(directory, name + '.ts'),
				source: name === 'helper' ? helper : page
			});
			expect(result.error).toBeUndefined();
			expect(result.diagnostics).toEqual([]);
			return { name, code: result.code! };
		});
		for (const result of results)
			await writeFile(path.join(directory, result.name + '.ts'), result.code);
		const module = await importArtifact(
			path.join(directory, 'page.ts'),
			path.join(directory, 'page.mjs')
		);
		const contract = readExactEnhancementContexts(module.Page as AnyComponentFunction)!;
		expect(contract.provides).toEqual([(module.Token as ContextToken<number>).id]);
		expect(contract.requires).toEqual([]);
		expect(contract.optionallyConsumes).toEqual([]);
		expect(Object.isFrozen(contract.provides)).toBe(true);
	});
