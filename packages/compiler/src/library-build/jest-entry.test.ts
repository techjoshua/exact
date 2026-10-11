import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { buildLibrary } from './build.js';
import { createLibraryBuildFixture } from '../test-support/library-build.fixture.js';

it.each([false, true])(
	'publishes a Jest integration entry, selective=%s',
	async (selective) => {
		const { root, manifest, json } = await createLibraryBuildFixture();
		await writeFile(path.join(root, 'src/jest.ts'), 'export const runner = "jest-entry";');
		await writeFile(
			path.join(root, 'src/index.ts'),
			'export { Example } from "./Example.js"; export { runner } from "./jest.js";'
		);
		if (selective)
			await json('package.json', {
				...manifest,
				exactCompileModules: ['src/index.ts', 'src/Example.tsx']
			});
		await mkdir(path.join(root, 'dist'));
		await writeFile(path.join(root, 'dist/jest.js'), 'export const runner = "jest-entry";');
		await buildLibrary({ root, declarations: false });
		for (const target of ['client', 'server']) {
			const entry = await readFile(path.join(root, 'dist', target, 'jest.js'), 'utf8');
			expect(entry).toContain('jest-entry');
			expect(await readFile(path.join(root, 'dist', target, 'index.js'), 'utf8')).toContain(
				'./jest.js'
			);
		}
	},
	30_000
);
