import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';
import { enhancementTemplateCases } from '../test-support/enhancement-template-cases.js';

for (const target of ['client', 'server'] as const)
	for (const [kind, value, valid] of enhancementTemplateCases)
		it(`checks quoted and expression ${kind} template props ${JSON.stringify(value)} (${target})`, async () => {
			const parent = path.resolve('.tmp/enhancement-template-types');
			await mkdir(parent, { recursive: true });
			const root = await mkdtemp(path.join(parent, 'case-'));
			onTestFinished(() => rm(root, { recursive: true, force: true }));
			const configFile = path.join(root, 'tsconfig.json');
			await Promise.all([
				writeFile(
					configFile,
					JSON.stringify({
						compilerOptions: {
							target: 'ESNext',
							module: 'ESNext',
							moduleResolution: 'Bundler',
							jsx: 'preserve',
							strict: true
						},
						include: ['*.ts', '*.tsx']
					})
				),
				writeFile(
					path.join(root, 'facade.ts'),
					'export { schema } from "./impl.js" with {type:"exact-enhancement"};'
				),
				writeFile(
					path.join(root, 'impl.ts'),
					'export function schema(props:{value:`${' +
						kind +
						'}`;children?:unknown}){return()=>props.children;}'
				)
			]);
			const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
			onTestFinished(() => compiler.dispose());
			for (const quoted of [true, false]) {
				const literal = JSON.stringify(value);
				const source =
					'import {schema} from "./facade.js" with {type:"exact-enhancement"}; export function Page(){return()=> <div schema:value=' +
					(quoted ? literal : '{' + literal + '}') +
					'/>; }';
				const id = path.join(root, 'entry.tsx');
				await writeFile(id, source);
				const result = compiler.request({
					id,
					configFile,
					root,
					source,
					target,
					kind: 'compile',
					diagnostics: 'semantic'
				});
				expect(result.error).toBeUndefined();
				expect(
					result.diagnostics?.some(({ code }) => code === 'EXACT6011'),
					`quoted=${quoted}`
				).toBe(!valid);
				if (valid) {
					expect(result.diagnostics).toEqual([]);
					expect(result.code).toBeTruthy();
				}
			}
		});
