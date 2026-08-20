import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { artifactPathsFor, outputPathFor } from './paths.js';

describe('compiler output paths', () => {
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
