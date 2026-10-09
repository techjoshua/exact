import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import {
	applicationExactComponentLibraryRoots,
	applicationExactComponentLibraryNames
} from './component-library-roots.js';

async function fixture() {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-library-roots-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	const manifest = async (directory: string, value: object) => {
		await mkdir(directory, { recursive: true });
		await writeFile(path.join(directory, 'package.json'), JSON.stringify(value));
	};
	return { root, manifest };
}

it('finds physical declared libraries through cycles while excluding ordinary dependencies', async () => {
	const { root, manifest } = await fixture();
	const linked = path.join(root, 'linked');
	const nested = path.join(linked, 'node_modules/nested');
	await manifest(root, {
		dependencies: { kit: '*', ordinary: '*' },
		optionalDependencies: { absent: '*' }
	});
	await manifest(linked, {
		exactComponentLibrary: { protocol: 1 },
		dependencies: { nested: '*', kit: '*' }
	});
	await manifest(nested, {
		exactComponentLibrary: { protocol: 1 },
		peerDependencies: { peer: '*' }
	});
	const peer = path.join(root, 'node_modules/peer');
	await manifest(peer, { exactComponentLibrary: { protocol: 1 } });
	await manifest(path.join(root, 'node_modules/ordinary'), { dependencies: { hidden: '*' } });
	await manifest(path.join(root, 'node_modules/ordinary/node_modules/hidden'), {
		exactComponentLibrary: { protocol: 1 }
	});
	await symlink(linked, path.join(root, 'node_modules/kit'), 'dir');
	expect(await applicationExactComponentLibraryRoots(root)).toEqual([linked, nested, peer].sort());
	expect(await applicationExactComponentLibraryNames(root)).toEqual(['kit', 'nested', 'peer']);
});

it('does not hide malformed installed manifests or accept an array as participation', async () => {
	const { root, manifest } = await fixture();
	await manifest(root, { devDependencies: { kit: '*' } });
	const kit = path.join(root, 'node_modules/kit');
	await manifest(kit, { exactComponentLibrary: [] });
	expect(await applicationExactComponentLibraryRoots(root)).toEqual([]);
	await writeFile(path.join(kit, 'package.json'), '{broken');
	await expect(applicationExactComponentLibraryRoots(root)).rejects.toThrow();
});
