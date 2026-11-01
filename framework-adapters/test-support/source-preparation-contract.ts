import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { IntlBuildCoordinator } from '@exactjs/intl-build';

type PreparedSource = Readonly<{
	intlAnalysis?: ReturnType<IntlBuildCoordinator['analyzeConfiguredSource']>;
}>;

/** Exercises actual Intl publication through the adapter's build-local preparation owner. */
export async function verifySourcePreparationContract(
	adapter: string,
	create: (input: {
		filename: string;
		intl: IntlBuildCoordinator;
		options: {
			applicationRoot: string;
			target: 'server';
			reactCompatibility: false;
			internationalization: { owner: string; sourceLocale: string };
		};
	}) => {
		prepare(source: string, target: 'client' | 'server'): PreparedSource;
		clear(): void;
	}
): Promise<void> {
	const parent = path.resolve('.tmp/host-source-preparation-adapters');
	await mkdir(parent, { recursive: true });
	const root = await mkdtemp(path.join(parent, adapter + '-'));
	let intl: IntlBuildCoordinator | undefined;
	try {
		await writeFile(
			path.join(root, 'package.json'),
			'{"name":"@fixture/source-preparation","private":true}'
		);
		let publications = 0;
		const internationalization = {
			owner: 'fixture',
			sourceLocale: 'en-US',
			onClientRequirements: () => {
				publications++;
			}
		};
		intl = new IntlBuildCoordinator({
			applicationRoot: root,
			target: 'server',
			configuration: internationalization
		});
		const cache = create({
			filename: path.join(root, 'helper.tsx'),
			intl,
			options: {
				applicationRoot: root,
				target: 'server',
				reactCompatibility: false,
				internationalization
			}
		});
		const source = `import * as intl from '@exactjs/intl/enhancements' with {type:'exact-enhancement'};export function Label(){return()=> <p intl:message>Hello helper</p>}`;
		await intl.beginBuild();
		const first = cache.prepare(source, 'server');
		const same = cache.prepare(source, 'server');
		const samePublications = publications;
		const client = cache.prepare(source, 'client');
		const targetPublications = publications;
		const edited = cache.prepare(source.replace('Hello helper', 'Edited helper'), 'server');
		const editPublications = publications;
		cache.clear();
		await intl.beginBuild();
		const next = cache.prepare(source, 'server');
		assert.equal(first, same);
		assert.notEqual(first, client);
		assert.notEqual(first, edited);
		assert.notEqual(first, next);
		assert.deepEqual(
			[samePublications, targetPublications, editPublications, publications],
			[1, 2, 3, 4]
		);
		assert.ok(first.intlAnalysis?.code.includes('__exactIntlDescriptor0'));
		assert.ok(edited.intlAnalysis?.code.includes('Edited helper'));
		cache.clear();
	} finally {
		intl?.dispose();
		await rm(root, { recursive: true, force: true });
	}
}
