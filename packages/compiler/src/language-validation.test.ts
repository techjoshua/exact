import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileProject } from './compilation/file-compilation.js';
import { compileProjectArtifacts } from './compilation/artifact-compilation.js';

const temporaryRoots: string[] = [];
afterEach(async () => {
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
	);
});

describe('compilation language validation gate', () => {
	it('does not publish prepared output when a trusted provider reports an error', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-language-compilation-'));
		temporaryRoots.push(root);
		const sourceFile = path.join(root, 'src', 'view.tsx');
		const outputDirectory = path.join(root, 'dist');
		await mkdir(path.dirname(sourceFile), { recursive: true });
		await installProvider(root);
		await writeFile(
			sourceFile,
			`import { validator } from '@fixture/compiler-validator' with { type: 'exact-enhancement' };
			export function View() { return () => <p>Invalid fixture</p>; }
			`
		);

		await expect(
			compileProject([sourceFile], {
				root,
				rootDir: path.join(root, 'src'),
				outDir: outputDirectory,
				languageExtensions: { analyzers: { mode: 'all' } }
			})
		).rejects.toThrow('@fixture/compiler-validator/rejected-source');
		await expect(access(path.join(outputDirectory, 'view.js'))).rejects.toMatchObject({
			code: 'ENOENT'
		});
	});

	it('does not publish paired artifacts when a trusted provider reports an error', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-language-artifacts-'));
		temporaryRoots.push(root);
		const sourceDirectory = path.join(root, 'src');
		const sourceFile = path.join(sourceDirectory, 'view.tsx');
		const outputDirectory = path.join(root, 'dist');
		await mkdir(sourceDirectory, { recursive: true });
		await installProvider(root);
		await writeFile(
			sourceFile,
			`import { validator } from '@fixture/compiler-validator' with { type: 'exact-enhancement' };
			export function View() { return () => <p>Invalid fixture</p>; }
			`
		);

		await expect(
			compileProjectArtifacts([sourceFile], {
				rootDir: sourceDirectory,
				outDir: outputDirectory,
				languageExtensions: { analyzers: { mode: 'all' } }
			})
		).rejects.toThrow('@fixture/compiler-validator/rejected-source');
		await expect(access(path.join(outputDirectory, 'view.client.js'))).rejects.toMatchObject({
			code: 'ENOENT'
		});
		await expect(access(path.join(outputDirectory, 'view.server.js'))).rejects.toMatchObject({
			code: 'ENOENT'
		});
	});
});

async function installProvider(root: string): Promise<void> {
	const packageRoot = path.join(root, 'node_modules', '@fixture', 'compiler-validator');
	await mkdir(packageRoot, { recursive: true });
	await writeFile(
		path.join(root, 'package.json'),
		JSON.stringify({
			name: 'fixture-app',
			dependencies: { '@fixture/compiler-validator': '1.0.0' }
		})
	);
	await writeFile(
		path.join(packageRoot, 'package.json'),
		JSON.stringify({
			name: '@fixture/compiler-validator',
			version: '1.0.0',
			type: 'module',
			types: './index.d.ts',
			exports: {
				'.': { types: './index.d.ts', import: './index.mjs', default: './index.mjs' },
				'./language': './language.mjs'
			},
			dependencies: { '@exactjs/language-extension-api': '^0.1.0' },
			exact: {
				language: {
					schemaVersion: 1,
					analyzer: {
						protocolVersion: '^1.0.0',
						subpath: './language',
						capabilities: ['diagnostics'],
						projection: ['sourceText']
					}
				}
			}
		})
	);
	await writeFile(path.join(packageRoot, 'index.mjs'), 'export const validator = true;\n');
	await writeFile(
		path.join(packageRoot, 'index.d.ts'),
		`export { validator } from './validator.js' with { type: 'exact-enhancement' };\n`
	);
	await writeFile(
		path.join(packageRoot, 'validator.d.ts'),
		'export declare function validator(props: { enabled?: boolean }): () => null;\n'
	);
	await writeFile(
		path.join(packageRoot, 'language.mjs'),
		`export function createExactLanguageAnalyzer() {
			return { diagnostics: async () => [{ code: 'rejected-source', severity: 'error', range: { start: 0, end: 1 }, summary: 'Fixture rejected source.' }] };
		}\n`
	);
}
