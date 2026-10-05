import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Each build adapter preserves quoted template constraints without converting the authored string. */
export async function verifyEnhancementTemplateContract(
	adapter: 'vite' | 'webpack' | 'bun'
): Promise<void> {
	const parent = path.resolve('.tmp/enhancement-template-adapters');
	await mkdir(parent, { recursive: true });
	const root = await mkdtemp(path.join(parent, adapter + '-'));
	try {
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/enhancement-template', type: 'module', private: true })
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
				path.join(root, 'tsconfig.json'),
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
				'export {schema} from "./impl.js" with {type:"exact-enhancement"};'
			),
			writeFile(
				path.join(root, 'impl.ts'),
				'export function schema(props:{value:`${bigint}`;amount?:`${number}`;children?:unknown}){return()=>props.children;}'
			)
		]);
		for (const target of ['client', 'server'] as const) {
			for (const [attributes, valid] of [
				['schema:value="123456789012345678901234567890" schema:amount="0x10"', true],
				['schema:value="0x10" schema:amount="1e3"', true],
				['schema:value="12n"', false],
				['schema:value="12" schema:amount="Infinity"', false]
			] as const) {
				await writeFile(
					path.join(root, 'entry.tsx'),
					'import {schema} from "./facade.js" with {type:"exact-enhancement"}; export function Page(){return()=> <div ' +
						attributes +
						'/>; }'
				);
				let failure: unknown;
				try {
					await buildDiagnosticFixture(adapter, root, target);
				} catch (error) {
					failure = error;
				}
				if (valid) assert.equal(failure, undefined, `${adapter}/${target}: ${String(failure)}`);
				else
					assert.ok(
						String(failure).includes('EXACT6011'),
						`${adapter}/${target} lost the template constraint: ${String(failure)}`
					);
			}
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
