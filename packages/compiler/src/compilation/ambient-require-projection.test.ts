/** @vitest-environment jsdom */
import { copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import type { AnyComponentFunction } from '@exactjs/core';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from '@exactjs/dom';
import { renderToString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createCompilerTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

it('projects literal ambient require by provider and preserves a lexical require', async () => {
	const root = await createCompilerTestWorkspace('.exact-ambient-require-', process.cwd());
	const files = await writeTestFiles(root, {
		'portable.tsx': `
const label = require('./portable-label.cjs') as string;
export function Portable() { return () => <output>{label}</output>; }
export function Direct() { return () => <output>{require('./portable-label.cjs') as string}</output>; }
`,
		'node-only.tsx': `
const nodePath: typeof import('node:path') = require('node:path');
export function NodeOnly() { return () => <output>{nodePath.posix.join('node', 'only')}</output>; }
export function Dynamic(props: { name: string }) {
	return () => <output>{(require(props.name) as typeof import('node:path')).posix.join('node', 'dynamic')}</output>;
}
const load = require;
export function Opaque() {
	return () => <output>{(load('node:path') as typeof import('node:path')).posix.join('node', 'opaque')}</output>;
}
export function Shadow() {
	const require = (name: string) => name === 'node:path' ? 'authored' : 'unexpected';
	return () => <output>{require('node:path')}</output>;
}
`,
		'portable-label.cjs': "module.exports = 'portable';"
	});
	const outDir = path.join(root, 'generated');
	const artifacts = await compileProjectArtifacts(
		[files['portable.tsx']!, files['node-only.tsx']!],
		{
			rootDir: root,
			outDir,
			serverComponents: true
		}
	);
	const portable = artifacts.find(({ inputFile }) => inputFile === files['portable.tsx'])!;
	const nodeOnly = artifacts.find(({ inputFile }) => inputFile === files['node-only.tsx'])!;
	// The host resolves this ordinary CommonJS dependency beside the emitted entry.
	await copyFile(files['portable-label.cjs']!, path.join(outDir, 'portable-label.cjs'));

	vi.stubGlobal('document', undefined);
	// The ESM test bundle needs a loader for the external Node builtin. Use Node's
	// CommonJS loader so the test exercises placement with a real provider.
	vi.stubGlobal('require', createRequire(nodeOnly.serverFile));
	try {
		const server = await importArtifact(nodeOnly.serverFile, path.join(root, 'node-server.mjs'));
		const portableServer = await importArtifact(
			portable.serverFile,
			path.join(root, 'portable-server.mjs')
		);
		for (const [component, label, props] of [
			[server.NodeOnly, 'node/only', {}],
			[server.Dynamic, 'node/dynamic', { name: 'node:path' }],
			[server.Opaque, 'node/opaque', {}],
			[server.Shadow, 'authored', {}],
			[portableServer.Portable, 'portable', {}],
			[portableServer.Direct, 'portable', {}]
		] as const) {
			expect(
				(
					await renderToString(receipt(component as AnyComponentFunction, props), {
						markers: false
					})
				).html
			).toBe(`<output>${label}</output>`);
		}
	} finally {
		vi.unstubAllGlobals();
	}

	vi.stubGlobal('require', undefined);
	const host = document.createElement('div');
	try {
		const client = await importArtifact(nodeOnly.clientFile, path.join(root, 'node-client.mjs'));
		const portableClient = await importArtifact(
			portable.clientFile,
			path.join(root, 'portable-client.mjs')
		);
		for (const name of ['NodeOnly', 'Dynamic', 'Opaque']) {
			const component = nodeOnly.build.exposureRoots.find(({ exportName }) => exportName === name);
			expect(component).toBeDefined();
			expect(nodeOnly.client.componentBuild.components).toContainEqual(
				expect.objectContaining({ id: component!.componentId, placement: 'server' })
			);
		}
		for (const [component, label] of [
			[client.Shadow, 'authored'],
			[portableClient.Portable, 'portable'],
			[portableClient.Direct, 'portable']
		] as const) {
			const errors: unknown[] = [];
			render(receipt(component as AnyComponentFunction, {}), host, {
				onErrorReport: ({ error }) => errors.push(error)
			});
			expect(errors).toEqual([]);
			expect(host.querySelector('output')?.textContent).toBe(label);
			unmount(host);
		}
	} finally {
		unmount(host);
		vi.unstubAllGlobals();
	}
});
