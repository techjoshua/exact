import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { buildLibrary } from './build.js';
import { inspectLibraryExports } from './export-inspection.js';
import { createLibraryBuildFixture } from '../test-support/library-build.fixture.js';

it('shares entry imports within a target and reloads transitive exports next generation', async () => {
	const { root } = await createLibraryBuildFixture();
	const log = path.join(root, 'evaluation.log');
	const entries = ['first', 'second'].map((name) => ({
		entry: path.join(root, `dist/client/${name}.mjs`),
		names: ['Example']
	}));
	async function publishEntries(): Promise<void> {
		await writeFile(
			path.join(root, 'dist/client/observed.mjs'),
			`import {appendFileSync} from 'node:fs';appendFileSync(${JSON.stringify(log)},'evaluated\\n');export {Example} from './index.js';`
		);
		for (const { entry } of entries)
			await writeFile(entry, "export {Example} from './observed.mjs';");
	}
	await buildLibrary({ root });
	await publishEntries();
	expect(await inspectLibraryExports([], 'client')).toEqual([]);
	const first = await inspectLibraryExports(entries, 'client');
	expect(first[0]!.Example).toBe(first[1]!.Example);
	expect(await readFile(log, 'utf8')).toBe('evaluated\n');
	// A valid request larger than common platform argv limits still crosses the owned stdin pipe.
	const large = await inspectLibraryExports(
		[{ entry: entries[0]!.entry, names: Array.from({ length: 20_000 }, () => 'Example') }],
		'client'
	);
	expect(large[0]!.Example).toBe(first[0]!.Example);
	await writeFile(
		path.join(root, 'src/Example.tsx'),
		'export function Changed(){return()=> <p>Next</p>;}'
	);
	await writeFile(
		path.join(root, 'src/index.ts'),
		"export {Changed as Example} from './Example.js';"
	);
	await buildLibrary({ root });
	await publishEntries();
	const next = await inspectLibraryExports(entries, 'client');
	expect(next[0]!.Example).not.toBe(first[0]!.Example);
	expect(next[0]!.Example).toBe(next[1]!.Example);
	expect(await readFile(log, 'utf8')).toBe('evaluated\nevaluated\nevaluated\n');
}, 30_000);

it('rejects missing and wrong-target exports, then accepts another independent inspection', async () => {
	const { root } = await createLibraryBuildFixture();
	await buildLibrary({ root });
	const client = path.join(root, 'dist/client/index.js');
	const server = path.join(root, 'dist/server/index.js');
	await expect(
		inspectLibraryExports([{ entry: client, names: ['Missing'] }], 'client')
	).rejects.toThrow(/not a compiled component artifact/);
	await expect(
		inspectLibraryExports([{ entry: client, names: ['Example'] }], 'server')
	).rejects.toThrow(/not a compiled component artifact/);
	const result = await inspectLibraryExports([{ entry: server, names: ['Example'] }], 'server');
	expect(typeof result[0]!.Example).toBe('string');
	const first = path.join(root, 'dist/client/late-first.mjs');
	const second = path.join(root, 'dist/client/late-second.mjs');
	await writeFile(
		first,
		"import {Example} from './index.js';export let Alias=Example;export function invalidateAlias(){Alias=()=>null;}"
	);
	await writeFile(
		second,
		"import {invalidateAlias} from './late-first.mjs';invalidateAlias();export {Example} from './index.js';"
	);
	// Every entry must be validated after the complete target graph has evaluated.
	await expect(
		inspectLibraryExports(
			[
				{ entry: first, names: ['Alias'] },
				{ entry: second, names: ['Example'] }
			],
			'client'
		)
	).rejects.toThrow(/not a compiled component artifact/);
	const recovered = await inspectLibraryExports([{ entry: first, names: ['Alias'] }], 'client');
	expect(typeof recovered[0]!.Alias).toBe('string');
}, 30_000);
