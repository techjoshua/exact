import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { renderToString } from '@exactjs/ssr';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { analyzeSource } from './source-analysis.js';
it('preserves optional native receivers and URI results through server rendering', async () => {
	const root = await createCompilerTestWorkspace('.exact-portable-native-call-', process.cwd());
	const entry = path.join(root, 'page.tsx');
	const source = `export function read(items?:number[]){return items?.some(value=>value>0)??false;}export function contains(value?:string){return value?.includes('x')??false;}export function decode(value:string){return decodeURIComponent(value);}export function Page(props:{format:(value:string)=>string}){const value=decodeURIComponent(encodeURIComponent('a/b ?'));return()=> <p>{props.format(value)}:{String(read())}:{String(read([1]))}</p>;}`;
	await writeFile(entry, source);
	expect(
		analyzeSource(source, { filename: entry, target: 'server' }).components[0]?.placement
	).toBe('isomorphic');
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'));
	const output = await renderToString(
		receipt(server.Page as never, { format: (value: string) => 'decoded:' + value })
	);
	expect(output.html).toContain('decoded:a/b ?:false:true');
	expect((server.read as (items?: number[]) => boolean)()).toBe(false);
	expect((server.read as (items?: number[]) => boolean)([-1])).toBe(false);
	expect((server.read as (items?: number[]) => boolean)([1])).toBe(true);
	expect((server.contains as (value?: string) => boolean)()).toBe(false);
	expect((server.contains as (value?: string) => boolean)('x')).toBe(true);
	expect(() => (server.decode as (value: string) => string)('%')).toThrow(URIError);
});
