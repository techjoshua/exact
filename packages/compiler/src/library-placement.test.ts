import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { buildLibrary } from './library-build.js';
import { transform } from './index.js';
import { createLibraryBuildFixture } from './test-support/library-build.fixture.js';

it('keeps browser timer placement with Node ambient declarations loaded', async () => {
	const { root, json } = await createLibraryBuildFixture();
	const configFile = path.join(root, 'tsconfig.json');
	const config = JSON.parse(await readFile(configFile, 'utf8'));
	await json('tsconfig.json', {
		...config,
		compilerOptions: { ...config.compilerOptions, lib: ['ES2022', 'DOM'], types: ['node'] }
	});
	const filename = path.join(root, 'src/Example.tsx');
	const source = `import type {Component} from '@exactjs/core';export function Example(this:Component<{running:boolean}>){this.state.running=false;const step=()=>{this.state.running=false;};const advance=()=>{window.setInterval(()=>{if(this.state.running)step();},90);};advance();return()=> <p>{this.state.running}</p>;}`;
	await writeFile(filename, source);
	const options = {
		filename,
		root,
		configFile: path.join(root, 'tsconfig.json'),
		generatedValidation: 'semantic' as const
	};
	const output = transform(source, { ...options, target: 'client' });
	expect(output).toContain('__exactTaskInterval');
	expect(output).toMatch(/placement:\s*"current"/);
});

it('rejects unresolved component placement before replacing a previously valid library', async () => {
	const { root } = await createLibraryBuildFixture();
	await buildLibrary({ root });
	const output = path.join(root, 'dist/client/Example.js');
	const previous = await readFile(output, 'utf8');
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		`declare const provider:{read():string};export function Example(){const value=provider.read();return()=> <p>{value}</p>;}`
	);
	await expect(buildLibrary({ root })).rejects.toThrow(/Example.*placement|placement.*Example/);
	expect(await readFile(output, 'utf8')).toBe(previous);
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		`const provider={read(){return 'Verified';}};export function Example(){const value=provider.read();return()=> <p>{value}</p>;}`
	);
	await buildLibrary({ root });
	expect(await readFile(output, 'utf8')).toContain('Verified');
}, 30_000);

it.each([
	['value.fixture.ts', false],
	['value.fixtures.ts', false],
	['value.fixture.ts', true],
	['value.fixtures.ts', true]
] as const)(
	'rejects imports of manifest-excluded %s with selective compilation %s',
	async (name, selective) => {
		const { root, manifest, json } = await createLibraryBuildFixture();
		await json('package.json', {
			...manifest,
			files: ['dist', '!dist/**/*.fixtures.*'],
			...(selective ? { exactCompileModules: ['src/Example.tsx'] } : {})
		});
		await writeFile(path.join(root, 'src', name), 'export const value="support";');
		await writeFile(
			path.join(root, 'src/Example.tsx'),
			`import {value} from './${name.replace(/\.ts$/, '.js')}';export function Example(){return()=> <p>{value}</p>;}`
		);
		await expect(buildLibrary({ root, declarations: false })).rejects.toThrow(
			/unpublished.*source/
		);
	}
);

// Publication must use declaration ownership, even when ambient declarations or
// service names resemble portable globals. Failed generations keep prior output.
it('rejects borrowed native authority before publishing replacement artifacts', async () => {
	const { root } = await createLibraryBuildFixture();
	await buildLibrary({ root, declarations: false });
	const output = path.join(root, 'dist/client/Example.js');
	const previous = await readFile(output, 'utf8');
	await writeFile(
		path.join(root, 'src/lib.es.fixture.d.ts'),
		`interface ReadonlyArray<T>{custom():number;}declare namespace Intl{interface NumberFormat{custom():number;}}declare namespace Shadow{interface Array<T>{map():number;}}`
	);
	for (const source of [
		`declare const Math:{read():number};export function Example(){Math.read();return()=> <p/>;}`,
		`export function Example(props:{value:readonly number[]}){props.value.custom();return()=> <p/>;}`,
		`export function Example(props:{value:Intl.NumberFormat}){props.value.custom();return()=> <p/>;}`,
		`export function Example(props:{value:Shadow.Array<number>}){props.value.map();return()=> <p/>;}`
	]) {
		await writeFile(path.join(root, 'src/Example.tsx'), source);
		await expect(buildLibrary({ root, declarations: false })).rejects.toThrow(
			/Example.*placement|placement.*Example/
		);
		expect(await readFile(output, 'utf8')).toBe(previous);
	}
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		`export function Example(props:{value:readonly number[]}){return()=> <p>{props.value.map(value=>value+1).join(',')}</p>;}`
	);
	await buildLibrary({ root, declarations: false });
	expect(await readFile(output, 'utf8')).toContain('.map(');
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		`import{peek}from'@exactjs/core';export function Example(props:{value:Intl.NumberFormat}){const text=peek(()=>props.value.format(1));return()=> <p>{text}</p>;}`
	);
	await buildLibrary({ root, declarations: false });
	expect(await readFile(output, 'utf8')).toContain('.format(');
}, 30000);
