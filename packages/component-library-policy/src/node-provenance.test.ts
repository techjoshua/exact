import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { recordExactNodeComponentProvenance } from './node-provenance.js';
import { createExactComponentAuthorizationSession } from './session.js';

it.each([{}, { name: 'private-app' }, { version: '1.0.0' }])(
	'recognizes application ownership without publication metadata (%j)',
	async (metadata) => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-provenance-'));
		onTestFinished(() => rm(root, { recursive: true, force: true }));
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({ private: true, ...metadata })
		);
		const module = path.join(root, 'Panel.tsx');
		await writeFile(module, 'export function Panel() {}');
		const session = createExactComponentAuthorizationSession({ buildKey: 'local' });
		onTestFinished(() => session.dispose());
		const provenance = await recordExactNodeComponentProvenance({
			session,
			applicationRoot: root,
			importerModuleId: module,
			moduleSpecifier: './Panel.js',
			resolvedModuleId: module
		});
		expect(provenance.applicationOwned).toBe(true);
		expect(provenance.instance.root).toBe(root);
		expect(provenance.watchFiles).toContain(path.join(root, 'package.json'));
		// A nested package remains independently owned even though it is beneath the app directory.
		const library = path.join(root, 'node_modules/library');
		await mkdir(library, { recursive: true });
		await writeFile(
			path.join(library, 'package.json'),
			JSON.stringify({ private: true, ...metadata })
		);
		const imported = path.join(library, 'Panel.js');
		await writeFile(imported, 'export function Panel() {}');
		await expect(
			recordExactNodeComponentProvenance({
				session,
				applicationRoot: root,
				importerModuleId: module,
				moduleSpecifier: 'library',
				resolvedModuleId: imported
			})
		).rejects.toThrow('lacks name/version');
	}
);
