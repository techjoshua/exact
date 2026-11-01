import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

it('publishes imported finite helper companions with semantic validation intact', async () => {
	const { root } = await createLibraryBuildFixture();
	await writeFile(
		path.join(root, 'src/finite.ts'),
		`export function translate(state:{value:number},delta:number){if(!Number.isFinite(delta))throw delta;state.value+=delta;return state;}`
	);
	await writeFile(
		path.join(root, 'src/move.ts'),
		`import {translate} from './finite.js';export function move(state:{value:number},delta:number){return translate(state,delta);}`
	);
	await buildLibrary({ root });
	for (const target of ['client', 'server']) {
		const module = await import(
			/* @vite-ignore */ pathToFileURL(path.join(root, 'dist', target, 'move.js')).href
		);
		const state = { value: 1 };
		expect(module.move(state, 2)).toBe(state);
		expect(state.value).toBe(3);
		try {
			module.move(state, NaN);
			throw new Error('missing authored failure');
		} catch (error) {
			expect(error).toBeNaN();
		}
		expect(state.value).toBe(3);
	}
	const consumer = await readFile(path.join(root, 'dist/server/move.js'), 'utf8');
	const producer = await import(
		/* @vite-ignore */ pathToFileURL(path.join(root, 'dist/server/finite.js')).href
	);
	// The private import is an emitted linkage contract, not an authored helper name.
	const companion = consumer.match(/import \{\s*(__exact_owned_[a-z0-9_]+)/)?.[1];
	expect(companion).toBeDefined();
	expect(producer[companion!]).toBeTypeOf('function');
}, 30_000);
