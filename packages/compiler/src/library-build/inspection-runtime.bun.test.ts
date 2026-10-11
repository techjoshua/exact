import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildLibrary } from '@exactjs/compiler/library-build';
import { createLibraryBuildFilesFixture } from '../test-support/library-build-files.fixture.js';

const runningInBun = Boolean((globalThis as { Bun?: unknown }).Bun);
const bunTestModule: string = 'bun:test';
const testApi = (runningInBun ? await import(bunTestModule) : await import('vitest')) as Pick<
	typeof import('vitest'),
	'describe' | 'it' | 'expect'
>;
const describeBun = runningInBun ? testApi.describe : testApi.describe.skip;

describeBun('Bun-owned library export inspection', () => {
	testApi.it(
		'builds cold self-imports and ignores an invalid previous generation',
		async () => {
			const cleanup: (() => Promise<void>)[] = [];
			try {
				const { root, manifest, json } = await createLibraryBuildFilesFixture((dispose) =>
					cleanup.push(dispose)
				);
				await json('package.json', {
					...manifest,
					exports: {
						...manifest.exports,
						'./label': {
							types: './dist/label.d.ts',
							browser: './dist/client/label.js',
							default: './dist/server/label.js'
						}
					}
				});
				const config = JSON.parse(await readFile(path.join(root, 'tsconfig.json'), 'utf8'));
				config.compilerOptions.paths = { '@fixture/library/label': ['./src/label.ts'] };
				await json('tsconfig.json', config);
				await writeFile(
					path.join(root, 'src/Example.tsx'),
					"import {label} from '@fixture/library/label';export function Example(){return()=> <p>{label()}</p>;}"
				);
				const source = path.join(root, 'src/label.ts');
				await writeFile(source, 'export function label(){return "cold";}');
				await writeFile(path.join(root, 'src/jest.ts'), 'export const runner = "jest-entry";');
				const entry = path.join(root, 'src/index.ts');
				await writeFile(
					entry,
					`${await readFile(entry, 'utf8')}export { runner } from './jest.js';`
				);
				await buildLibrary({ root });
				for (const target of ['client', 'server'])
					testApi
						.expect(await readFile(path.join(root, 'dist', target, 'jest.js'), 'utf8'))
						.toContain('jest-entry');
				const previous = path.join(root, 'dist/server/label.js');
				await writeFile(previous, 'throw new Error("stale helper");');
				await writeFile(source, 'export function label(){return "updated";}');
				await buildLibrary({ root });
				testApi.expect(await readFile(previous, 'utf8')).toContain('updated');
			} finally {
				for (const dispose of cleanup.reverse()) await dispose();
			}
		},
		30_000
	);
});
