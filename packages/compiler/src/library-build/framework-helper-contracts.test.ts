import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { buildLibrary } from '../library-build.js';
import { createLibraryBuildFixture } from '../test-support/library-build.fixture.js';

it('publishes components that derive chart colors from the installed theme declarations', async () => {
	const { root, manifest, json } = await createLibraryBuildFixture();
	await json('package.json', {
		...manifest,
		dependencies: { ...manifest.dependencies, '@exactjs/theme': '^0.7.1' }
	});
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		`import {deriveDataColors,type ResolvedTheme} from '@exactjs/theme';
export function Example(props:{theme:ResolvedTheme}){const colors=deriveDataColors(props.theme,{kind:'categorical',count:3});return()=> <p>{colors.colors.join(',')}</p>;}`
	);
	await buildLibrary({ root });
	const facts = JSON.parse(
		await readFile(path.join(root, 'dist/exact-component-build.json'), 'utf8')
	);
	expect(facts.exports).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ exportName: 'Example', condition: 'browser' }),
			expect.objectContaining({ exportName: 'Example', condition: 'default' })
		])
	);
	for (const target of ['client', 'server']) {
		expect(await readFile(path.join(root, 'dist', target, 'Example.js'), 'utf8')).toContain(
			'deriveDataColors'
		);
	}
}, 30_000);
