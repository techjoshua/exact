import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { renderToString } from '@exactjs/ssr';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { analyzeSource } from './source-analysis.js';
it.each([
	`if(typeof window==='undefined') return 'portable'; return window.location.href;`,
	`if(typeof window==='undefined') return undefined; return {read:()=>window.location.href};`,
	`if(typeof window!=='undefined') return {read:()=>window.location.href}; return undefined;`
])('keeps guarded helper calls portable inside a component: %s', (body) => {
	const analysis = analyzeSource(
		`function read(){${body}} export function Page(){const value=read();return()=> <p>{value ? 'ready' : 'empty'}</p>;}`,
		{
			filename: path.resolve('early-environment-component.fixture.tsx'),
			target: 'server'
		}
	);
	expect(analysis.components[0]?.placement).toBe('isomorphic');
});
it.each([
	`if(typeof window==='undefined') return 'portable'; return window.location.href;`,
	`if(typeof window==='undefined') return 'portable'; return {read:()=>window.location.href};`,
	`if(typeof window!=='undefined') return {read:()=>window.location.href}; return 'portable';`
])('preserves a portable environment-guarded helper: %s', async (body) => {
	const root = await createCompilerTestWorkspace('.exact-early-environment-', process.cwd());
	const entry = path.join(root, 'helper.ts');
	await writeFile(entry, `export function read(){${body}}`);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const server = await importArtifact(artifact.serverFile, path.join(root, 'server.mjs'));
	expect(server.read).toBeTypeOf('function');
	expect((server.read as () => unknown)()).toBe('portable');
});
it.each(['direct', 'barrel'])(
	'retains server rendering through an imported guarded helper (%s)',
	async (mode) => {
		const root = await createCompilerTestWorkspace(
			'.exact-early-environment-import-',
			process.cwd()
		);
		await writeFile(
			path.join(root, 'location.ts'),
			`export function read(){if(typeof window==='undefined')return 'portable';return window.location.href;}`
		);
		await writeFile(path.join(root, 'barrel.ts'), `export {read} from './location.js';`);
		const entry = path.join(root, 'page.tsx');
		await writeFile(
			entry,
			`import {read} from './${mode === 'barrel' ? 'barrel' : 'location'}.js';export function Page(props:{format:(value:string)=>string}){const value=read();return()=> <p>{props.format(value)}</p>;}`
		);
		const artifacts = await compileProjectArtifacts([entry], {
			rootDir: root,
			outDir: path.join(root, 'generated')
		});
		const artifact = artifacts[0]!;
		const server = await importArtifact(artifact.serverFile, path.join(root, 'server.mjs'));
		const output = await renderToString(
			receipt(server.Page as never, { format: (value: string) => 'location:' + value })
		);
		expect(output.html).toContain('location:portable');
	}
);
it('retains the browser path of a portable helper', async () => {
	const root = await createCompilerTestWorkspace(
		'.exact-early-environment-browser-',
		process.cwd()
	);
	const entry = path.join(root, 'helper.ts');
	await writeFile(
		entry,
		`export function read(){if(typeof window==='undefined')return 'portable';return window.location.href;}`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
	vi.stubGlobal('window', { location: { href: 'https://example.test/browser' } });
	try {
		expect((client.read as () => unknown)()).toBe('https://example.test/browser');
	} finally {
		vi.unstubAllGlobals();
	}
});
it.each([
	`if(typeof window==='undefined'){} return window.location.href;`,
	`if(typeof window==='undefined'){if(Date.now())return 'portable';}return window.location.href;`,
	`const value=window.location.href;if(typeof window==='undefined')return 'portable';return value;`
])('keeps an unprotected component browser-owned: %s', (body) => {
	const analysis = analyzeSource(
		`function read(){${body}}export function Page(){const value=read();return()=> <p>{value}</p>;}`,
		{ filename: path.resolve('unprotected-environment.fixture.tsx'), target: 'server' }
	);
	expect(analysis.components[0]?.placement).toBe('client');
});
it('preserves authored terminal guards around module initializers', async () => {
	const root = await createCompilerTestWorkspace('.exact-module-environment-', process.cwd());
	const entry = path.join(root, 'value.ts');
	await writeFile(
		entry,
		`if(typeof window==='undefined')throw new Error('browser absent');export const href=window.location.href;`
	);
	const [artifact] = await compileProjectArtifacts([entry], {
		rootDir: root,
		outDir: path.join(root, 'generated')
	});
	await expect(importArtifact(artifact!.serverFile, path.join(root, 'server.mjs'))).rejects.toThrow(
		'browser absent'
	);
	vi.stubGlobal('window', { location: { href: 'https://example.test/module' } });
	try {
		const client = await importArtifact(artifact!.clientFile, path.join(root, 'client.mjs'));
		expect(client.href).toBe('https://example.test/module');
		const server = await importArtifact(
			artifact!.serverFile,
			path.join(root, 'server-browser.mjs')
		);
		expect(server.href).toBe('https://example.test/module');
	} finally {
		vi.unstubAllGlobals();
	}
});
