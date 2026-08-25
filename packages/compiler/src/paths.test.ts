import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
	artifactPathsFor,
	collectInputFiles,
	isTransformablePath,
	outputPathFor
} from './paths.js';

describe('compiler output paths', () => {
	it('accepts component modules whether or not their source contains JSX', () => {
		expect(isTransformablePath('provider.ts')).toBe(true);
		expect(isTransformablePath('provider.tsx')).toBe(true);
		expect(isTransformablePath('provider.mts')).toBe(true);
		expect(isTransformablePath('provider.d.ts')).toBe(false);
		expect(isTransformablePath('provider.json')).toBe(false);
	});

	it('collects non-JSX TypeScript component modules from source directories', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-compiler-paths-'));
		await mkdir(path.join(root, 'nested'));
		await Promise.all([
			writeFile(path.join(root, 'provider.ts'), 'export function Provider() {}'),
			writeFile(path.join(root, 'view.tsx'), 'export function View() { return <p />; }'),
			writeFile(path.join(root, 'types.d.ts'), 'export type Value = string;'),
			writeFile(path.join(root, 'nested', 'data.json'), '{}')
		]);

		expect((await collectInputFiles([root])).map((file) => path.relative(root, file))).toEqual([
			'provider.ts',
			'view.tsx'
		]);
	});

	it('preserves nested inputs beneath the declared source root', () => {
		const root = path.resolve('workspace', 'src');
		const input = path.join(root, 'components', 'Page.tsx');
		const outDir = path.resolve('workspace', 'dist');

		expect(outputPathFor(input, outDir, root)).toBe(path.join(outDir, 'components', 'Page.ts'));
		expect(artifactPathsFor(input, outDir, root)).toEqual({
			clientFile: path.join(outDir, 'components', 'Page.exact.client.ts'),
			serverFile: path.join(outDir, 'components', 'Page.exact.server.ts'),
			sharedFile: path.join(outDir, 'components', 'Page.exact.shared.ts')
		});
	});

	it('rejects inputs outside rootDir before deriving any output path', () => {
		const root = path.resolve('workspace', 'src');
		const input = path.resolve('workspace', 'outside', 'Page.tsx');
		const outDir = path.resolve('workspace', 'dist');

		expect(() => outputPathFor(input, outDir, root)).toThrow('is outside rootDir');
		expect(() => artifactPathsFor(input, outDir, root)).toThrow('is outside rootDir');
	});
});
