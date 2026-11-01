import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { prepareNativeConfigSource } from './native-config-preparation.js';

const execute = promisify(execFile);
const enhancement = `export * as theme from '@fixture/not-executed' with {type:'exact-enhancement',scope:'package'};`;

async function withDirectory(run: (directory: string) => Promise<void>): Promise<void> {
	const directory = await mkdtemp(path.join(tmpdir(), 'exact-preparation-test-'));
	try {
		await run(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

async function ownedTemporaryDirectories(): Promise<string[]> {
	return (await readdir(tmpdir()))
		.filter((name) => name.startsWith(`exact-config-prepare-${process.pid}-`))
		.sort();
}

// Exercise preparation directly. Import/evaluation stays an ordinary runtime
// operation, without loading the former TS6-backed production node.ts owner.
describe('native config preparation', () => {
	it('preserves UTF16 offsets, CRLF and namespace-export registration', async () => {
		const source = `// 🧭 café\r\n${enhancement}\r\nexport default {value:'🌈'};\r\n`;
		const filename = path.resolve('exact.config.mjs');
		const prepared = await prepareNativeConfigSource(source, filename);
		expect(prepared.packageEnhancements).toEqual([
			{
				localName: 'theme',
				moduleSpecifier: '@fixture/not-executed',
				importKind: 'namespace',
				declaredIn: filename
			}
		]);
		expect(prepared.executableSource.length).toBe(source.length);
		expect(prepared.executableSource.indexOf('export default')).toBe(
			source.indexOf('export default')
		);
		expect([...prepared.executableSource.matchAll(/\r\n/g)].map((match) => match.index)).toEqual(
			[...source.matchAll(/\r\n/g)].map((match) => match.index)
		);
		expect(prepared.executableSource.slice(source.indexOf('export default'))).toBe(
			source.slice(source.indexOf('export default'))
		);
		expect(prepared.executableSource).not.toContain('not-executed');
	});

	it('retains namespace-only, eligibility and duplicate errors', async () => {
		for (const declaration of [
			`import * as theme from 'pkg' with {type:'exact-enhancement',scope:'package'};`,
			`export {theme} from 'pkg' with {type:'exact-enhancement',scope:'package'};`,
			`export type * as theme from 'pkg' with {type:'exact-enhancement',scope:'package'};`
		])
			await expect(prepareNativeConfigSource(declaration, 'exact.config.ts')).rejects.toThrow(
				'attributed namespace export'
			);
		await expect(
			prepareNativeConfigSource(enhancement + enhancement, 'exact.config.ts')
		).rejects.toThrow('duplicate package-scoped enhancement identifier');
		const ineligible = `export * as untouched from 'pkg' with {type:'exact-enhancement',scope:'module'};`;
		const prepared = await prepareNativeConfigSource(ineligible, 'exact.config.mjs');
		expect(prepared.packageEnhancements).toEqual([]);
		expect(prepared.executableSource).toBe(ineligible);
	});

	it.each(['ts', 'mts'])(
		'emits isolated %s syntax and leaves relative imports/callback metadata native',
		async (extension) => {
			await withDirectory(async (directory) => {
				await writeFile(
					path.join(directory, 'tsconfig.json'),
					JSON.stringify({
						compilerOptions: {
							noEmit: true,
							module: 'CommonJS',
							target: 'ES5',
							experimentalDecorators: true
						}
					})
				);
				await writeFile(path.join(directory, 'dependency.mjs'), 'export const value=3;');
				await writeFile(
					path.join(directory, 'types.ts'),
					'export interface Settings { label: string }'
				);
				const filename = path.join(directory, `exact.config.${extension}`);
				const source = `${enhancement}
import type {Settings} from './types.js';
import {value} from './dependency.mjs';
enum Level { First=value, Second=4 }
const enum Constant { Seven=7 }
function decorate(target: Function, context: ClassDecoratorContext) {Object.defineProperty(target,'kind',{value:context.kind});}
@decorate class Tagged {static value=Level.Second;}
const unchecked:number='no semantic project check';
const settings:Settings={label:'ok'};
export default {level:Tagged.value,constant:Constant.Seven,kind:Reflect.get(Tagged,'kind'),label:settings.label,unchecked,callback:()=>({value,url:import.meta.url})};`;
				const prepared = await prepareNativeConfigSource(source, filename);
				expect(prepared.executableSource).not.toContain('not-executed');
				expect(prepared.executableSource).not.toContain('./types.js');
				expect(prepared.executableSource).not.toContain('require(');
				expect(prepared.executableSource).not.toContain('exact-config-prepare-');
				const module = path.join(directory, 'prepared.mjs');
				await writeFile(module, prepared.executableSource);
				const config = (await import(pathToFileURL(module).href)).default;
				expect({
					level: config.level,
					constant: config.constant,
					kind: config.kind,
					label: config.label,
					unchecked: config.unchecked
				}).toEqual({
					level: 4,
					constant: 7,
					kind: 'class',
					label: 'ok',
					unchecked: 'no semantic project check'
				});
				// Preparation leaves import.meta intact. The loading owner separately
				// restores authored metadata before evaluating its own temporary module.
				expect(config.callback()).toEqual({ value: 3, url: pathToFileURL(module).href });
				expect((await readdir(directory)).sort()).toEqual([
					'dependency.mjs',
					'prepared.mjs',
					'tsconfig.json',
					'types.ts'
				]);
			});
		}
	);

	it('retains the existing cts/CommonJS format boundary without inventing an ESM adapter', async () => {
		const prepared = await prepareNativeConfigSource(
			`enum Value { Three=3 };export default {value:Value.Three};`,
			'exact.config.cts'
		);
		expect(prepared.executableSource).toContain('exports.default');
		expect(prepared.executableSource).not.toContain('export default');
		await withDirectory(async (directory) => {
			const module = path.join(directory, 'prepared.mjs');
			await writeFile(module, prepared.executableSource);
			// Vitest adapts imports. Use the ordinary runtime for this format boundary.
			await expect(
				execute(process.execPath, [
					'--input-type=module',
					'-e',
					`await import(${JSON.stringify(pathToFileURL(module).href)})`
				])
			).rejects.toThrow(/exports/);
		});
	});

	it('extracts without TypeScript emit and leaves ordinary JavaScript intact', async () => {
		const typed = `${enhancement} const value:number=3;throw new Error('not executed');`;
		const extracted = await prepareNativeConfigSource(typed, 'exact.config.ts', { emit: false });
		expect(extracted.packageEnhancements).toHaveLength(1);
		expect(extracted.executableSource).toContain(
			"const value:number=3;throw new Error('not executed');"
		);
		expect(extracted.executableSource.length).toBe(typed.length);
		for (const extension of ['js', 'cjs']) {
			const source = 'module.exports={value:3};';
			const prepared = await prepareNativeConfigSource(source, `exact.config.${extension}`);
			expect(prepared.executableSource).toBe(source);
		}
	});

	it('cleans errors and concurrent preparations without stranding the serial owner', async () => {
		const before = await ownedTemporaryDirectories();
		const results = await Promise.allSettled([
			prepareNativeConfigSource('export default {broken: ;', 'exact.config.ts'),
			prepareNativeConfigSource(`${enhancement} export default {value:1};`, 'exact.config.ts'),
			prepareNativeConfigSource('export default {value:2};', 'exact.config.mts'),
			prepareNativeConfigSource('export default {value:3};', 'exact.config.ts')
		]);
		expect(results.map((result) => result.status)).toEqual([
			'rejected',
			'fulfilled',
			'fulfilled',
			'fulfilled'
		]);
		expect(await ownedTemporaryDirectories()).toEqual(before);
		await expect(
			prepareNativeConfigSource('export default {};', 'exact.config.ts')
		).resolves.toHaveProperty('executableSource');
		expect(await ownedTemporaryDirectories()).toEqual(before);
	});

	it('uses the current Bun executable for its packaged CLI and closes each preparation', async () => {
		const helper = new URL('./native-config-preparation.ts', import.meta.url).href;
		const script = `
import {prepareNativeConfigSource} from ${JSON.stringify(helper)};
import {mkdtemp,writeFile,rm,readdir} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=await mkdtemp(path.join(os.tmpdir(),'exact-bun-preparation-'));
try {
 const rows=[];
 for(const extension of ['ts','mts','cts']) {
  const prepared=await prepareNativeConfigSource('enum Value{Three=3};export default {value:Value.Three,callback:()=>import.meta.url};',path.join(root,'exact.config.'+extension));
  if(extension==='cts') {if(!prepared.executableSource.includes('exports.default'))throw Error('cts format changed');rows.push({extension,format:'CommonJS'});continue;}
  const filename=path.join(root,extension+'.mjs');await writeFile(filename,prepared.executableSource);const config=(await import(pathToFileURL(filename).href)).default;
  if(config.value!==3 || config.callback()!==pathToFileURL(filename).href)throw Error('runtime output/metadata');rows.push({extension,value:config.value});
 }
 const pending=await Promise.allSettled([prepareNativeConfigSource('export default {broken: ;','exact.config.ts'),prepareNativeConfigSource('export default {};','exact.config.ts')]);
 if(pending[0].status!=='rejected'||pending[1].status!=='fulfilled')throw Error('queue recovery');
 const residual=(await readdir(os.tmpdir())).filter(name=>name.startsWith('exact-config-prepare-'+process.pid+'-'));if(residual.length)throw Error('temporary residual');
 console.log(JSON.stringify({runtime:process.execPath,rows,residual}));
}finally{await rm(root,{recursive:true,force:true});}`;
		const { stdout } = await execute('bun', ['--eval', script], { maxBuffer: 1024 * 1024 });
		const result = JSON.parse(stdout.trim());
		assert.match(path.basename(result.runtime), /bun/i);
		expect(result.rows).toEqual([
			{ extension: 'ts', value: 3 },
			{ extension: 'mts', value: 3 },
			{ extension: 'cts', format: 'CommonJS' }
		]);
		expect(result.residual).toEqual([]);
	}, 20000);
});
