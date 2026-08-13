import type { ExactLanguageProjectionV1 } from '@exactjs/language-extension-api';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createExactLanguageExtensionHost } from './language-host.js';

const temporaryRoots: string[] = [];
afterEach(async () => {
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
	);
});

describe('trusted language analyzer host', () => {
	it('runs a relevant analyzer out of process and retains provider provenance', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-language-host-'));
		temporaryRoots.push(root);
		const packageRoot = path.join(root, 'node_modules', '@fixture', 'language-provider');
		await mkdir(packageRoot, { recursive: true });
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({
				name: 'fixture-app',
				dependencies: { '@fixture/language-provider': '1.0.0' }
			})
		);
		await writeFile(
			path.join(packageRoot, 'package.json'),
			JSON.stringify({
				name: '@fixture/language-provider',
				version: '1.0.0',
				type: 'module',
				exports: { '.': './index.mjs', './language': './language.mjs' },
				dependencies: { '@exactjs/language-extension-api': '^0.1.0' },
				exact: {
					language: {
						schemaVersion: 1,
						analyzer: {
							protocolVersion: '^1.0.0',
							subpath: './language',
							capabilities: ['diagnostics', 'hover', 'codeActions'],
							projection: ['sourceText']
						}
					}
				}
			})
		);
		await writeFile(path.join(packageRoot, 'index.mjs'), 'export {};\n');
		await writeFile(
			path.join(packageRoot, 'language.mjs'),
			`export function createExactLanguageAnalyzer() {
				return {
					diagnostics: async ({ projection }) => [{ code: 'fixture', severity: 'warning', range: { start: 0, end: 1 }, summary: projection.document.text }],
					hover: async () => ({ markdown: 'Fixture hover' }),
					codeActions: async () => [{ title: 'Escape', kind: 'quickfix', edits: [{ uri: 'file:///outside.ts', version: 1, range: { start: 0, end: 0 }, newText: 'unsafe' }] }]
				};
			}\n`
		);
		const host = createExactLanguageExtensionHost({
			workspaceRoot: root,
			config: { analyzers: { mode: 'all' } }
		});
		try {
			await host.synchronizeProviders(['@fixture/language-provider']);
			const result = await host.diagnostics(projection(root));
			expect(result.diagnostics).toMatchObject([
				{
					provider: '@fixture/language-provider',
					diagnostic: { code: 'fixture', summary: 'x' }
				}
			]);
			expect(await host.hover(projection(root), 0)).toMatchObject([
				{ provider: '@fixture/language-provider', value: { markdown: 'Fixture hover' } }
			]);
			expect(await host.codeActions(projection(root), { start: 0, end: 1 }, [])).toEqual([]);
			expect(host.status()).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: '@fixture/language-provider', health: 'failed' })
				])
			);
		} finally {
			await host.dispose();
		}
	});
});

function projection(root: string): ExactLanguageProjectionV1 {
	const filename = path.join(root, 'source.tsx');
	return {
		protocol: 1,
		generation: 1,
		project: { root, kind: 'configured' },
		document: {
			uri: pathToFileURL(filename).href,
			path: filename,
			version: 1,
			textHash: 'fixture',
			text: 'x'
		},
		imports: [],
		components: [],
		enhancements: [],
		jsx: [],
		expressions: [],
		types: []
	};
}
