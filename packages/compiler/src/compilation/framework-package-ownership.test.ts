import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import {
	applicationExactFrameworkPackages,
	applicationOwnsExactFrameworkPackage
} from './framework-package-ownership.js';

it('selects application framework instances without evaluating providers or claiming library-only packages', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-framework-owner-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	const library = path.join(root, 'node_modules/kit');
	for (const [owner, name] of [
		[root, 'core'],
		[library, 'core'],
		[library, 'motion']
	] as const) {
		const directory = path.join(owner, 'node_modules/@exactjs', name);
		await mkdir(directory, { recursive: true });
		await writeFile(
			path.join(directory, 'package.json'),
			JSON.stringify({ name: '@exactjs/' + name, exports: './index.js' })
		);
		await writeFile(path.join(directory, 'index.js'), "throw new Error('PROVIDER_EVALUATED');");
	}
	expect(applicationOwnsExactFrameworkPackage('@exactjs/core/internal', root)).toBe(true);
	expect(applicationOwnsExactFrameworkPackage('@exactjs/motion', root)).toBe(false);
	expect(applicationOwnsExactFrameworkPackage('kit', root)).toBe(false);
	expect(applicationExactFrameworkPackages(root)).toEqual(['@exactjs/core']);
	expect(applicationOwnsExactFrameworkPackage('@exactjs/motion', library)).toBe(true);
	const subpathOnly = path.join(root, 'node_modules/@exactjs/subpath-only');
	await mkdir(subpathOnly, { recursive: true });
	await writeFile(
		path.join(subpathOnly, 'package.json'),
		JSON.stringify({ name: '@exactjs/subpath-only', exports: { './provider': './provider.js' } })
	);
	await writeFile(path.join(subpathOnly, 'provider.js'), "throw new Error('PROVIDER_EVALUATED');");
	expect(applicationOwnsExactFrameworkPackage('@exactjs/subpath-only/provider', root)).toBe(true);
});
