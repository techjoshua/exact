import { cp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createLibraryBuildFixture } from '../test-support/library-build.fixture.js';
import { buildLibrary } from './build.js';
import { inspectLibraryExports } from './export-inspection.js';
import { withLibraryInspectionResolution } from './inspection-resolution.js';
import { withLibraryOutput } from './output.js';

it('inspects staged self-exports and private imports through cold builds, rejection, and recovery', async () => {
	const { root, manifest, json } = await createLibraryBuildFixture();
	await buildLibrary({ root });
	const snapshot = path.join(root, 'snapshot');
	await rename(path.join(root, 'dist'), snapshot);
	await json('package.json', {
		...manifest,
		exports: {
			...manifest.exports,
			'./mapped/*': './dist/*/index.js',
			'./blocked': null,
			'./support': './support.mjs'
		},
		imports: {
			'#client': './dist/client/index.js',
			'#server': './dist/server/index.js',
			'#conditional': { browser: './dist/client/index.js', default: './dist/server/index.js' }
		}
	});
	await writeFile(
		path.join(root, 'support.mjs'),
		"export {Example} from '@fixture/library/mapped/client';"
	);
	async function candidate(invalid?: 'target' | 'excluded' | 'missing') {
		await withLibraryOutput(root, false, async (next) => {
			await cp(snapshot, next, { recursive: true });
			const entry = path.join(next, 'probe.mjs');
			await writeFile(entry, "export {Example} from '@fixture/library/mapped/client';");
			// Without a candidate package scope, Node resolves self-imports into missing or stale dist.
			await expect(
				inspectLibraryExports([{ entry, names: ['Example'] }], 'client')
			).rejects.toThrow();
			await withLibraryInspectionResolution(root, next, async (scope) => {
				if (invalid === 'missing') await rm(path.join(next, 'client/index.js'));
				for (const target of ['client', 'server']) {
					await writeFile(entry, `export {Example} from '@fixture/library/mapped/${target}';`);
					const result = await inspectLibraryExports(
						[{ entry, names: ['Example'] }],
						target,
						scope
					);
					expect(typeof result[0]!.Example).toBe('string');
					for (const specifier of ['@fixture/library', '#conditional']) {
						await writeFile(entry, `export {Example} from '${specifier}';`);
						expect(
							await inspectLibraryExports([{ entry, names: ['Example'] }], target, scope)
						).toEqual(result);
					}
					await writeFile(entry, `export {Example} from '#${target}';`);
					expect(
						await inspectLibraryExports([{ entry, names: ['Example'] }], target, scope)
					).toEqual(result);
				}
				await writeFile(entry, "export {Example} from '@fixture/library/support';");
				expect(
					typeof (await inspectLibraryExports([{ entry, names: ['Example'] }], 'client', scope))[0]!
						.Example
				).toBe('string');
				if (invalid) {
					await writeFile(
						entry,
						`export {Example} from '@fixture/library/${invalid === 'excluded' ? 'blocked' : 'mapped/client'}';`
					);
					await inspectLibraryExports([{ entry, names: ['Example'] }], 'server', scope);
				}
			});
			await expect(
				readFile(path.join(path.dirname(next), 'inspection-resolver.mjs'))
			).rejects.toThrow(/ENOENT/);
		});
	}
	await candidate();
	await expect(readFile(path.join(root, 'dist/inspection-resolver.mjs'))).rejects.toThrow(/ENOENT/);
	// A prior invalid generation must not supply self-imports to a valid candidate.
	const previous = path.join(root, 'dist/client/index.js');
	await writeFile(previous, 'export const Example = () => null;');
	await expect(candidate('target')).rejects.toThrow(/not a compiled component artifact/);
	expect(await readFile(previous, 'utf8')).toBe('export const Example = () => null;');
	await expect(candidate('excluded')).rejects.toThrow(/not defined by "exports"/);
	await expect(candidate('missing')).rejects.toThrow(/Cannot find module/);
	expect(await readFile(previous, 'utf8')).toBe('export const Example = () => null;');
	await candidate();
	expect(await readFile(previous, 'utf8')).toBe(
		await readFile(path.join(snapshot, 'client/index.js'), 'utf8')
	);
}, 30_000);
