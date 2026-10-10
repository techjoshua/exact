import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildLibrary } from './build.js';
import { watchLibraryBuild } from './watch.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { findExactConfig } from '@exactjs/config/node';

vi.mock('./build.js', () => ({ buildLibrary: vi.fn(async () => {}) }));

it('rebuilds for shared config edits and nearer config creation, removal, and recovery', async () => {
	const workspace = await createTestWorkspace('exact-library-shared-watch-');
	const root = path.join(workspace, 'packages', 'kit');
	await mkdir(path.join(root, 'src'), { recursive: true });
	await writeFile(path.join(root, 'tsconfig.json'), '{"include":["src"]}');
	const shared = path.join(workspace, 'exact.config.mjs');
	const nearer = path.join(workspace, 'packages', 'exact.config.ts');
	await writeFile(shared, 'export default {};');
	const selected: (string | undefined)[] = [];
	vi.mocked(buildLibrary).mockImplementation(async () => {
		selected.push(findExactConfig(root));
	});
	const watcher = watchLibraryBuild({ root });
	try {
		await watcher.ready;
		expect(selected.at(-1)).toBe(shared);
		const edit = async (change: () => Promise<unknown>, expected: string | undefined) => {
			const before = selected.length;
			await change();
			await vi.waitFor(() => expect(selected.length).toBeGreaterThan(before), { timeout: 3000 });
			expect(selected.at(-1)).toBe(expected);
		};
		await edit(() => writeFile(shared, 'export default {enhancements:{}};'), shared);
		await edit(() => writeFile(nearer, 'export default {};'), nearer);
		await edit(() => rm(nearer), shared);
		await edit(() => rm(shared), undefined);
		await edit(() => writeFile(shared, 'export default {};'), shared);
	} finally {
		await watcher.close();
		vi.mocked(buildLibrary).mockImplementation(async () => {});
	}
});

it('leaves asset edits to their asset owner while rebuilding imported JSON and source files', async () => {
	const root = await createTestWorkspace('exact-library-watch-selection-');
	await mkdir(path.join(root, 'src'));
	await writeFile(path.join(root, 'tsconfig.json'), '{"include":["src"]}');
	await writeFile(path.join(root, 'src/index.ts'), 'export const label = 1;');
	const watcher = watchLibraryBuild({ root });
	try {
		await watcher.ready;
		const build = vi.mocked(buildLibrary);
		const before = build.mock.calls.length;
		await writeFile(path.join(root, 'src/styles.css'), 'span {color:red}');
		await new Promise((resolve) => setTimeout(resolve, 450));
		expect(build.mock.calls.length).toBe(before);
		await mkdir(path.join(root, 'src/data.files'));
		await writeFile(path.join(root, 'src/data.files/value.json'), '{"label":2}');
		await vi.waitFor(() => expect(build.mock.calls.length).toBeGreaterThan(before));
		// Removing a JSON-only directory must still invalidate imported value types.
		const beforeRemoval = build.mock.calls.length;
		await rm(path.join(root, 'src/data.files'), { recursive: true });
		await vi.waitFor(() => expect(build.mock.calls.length).toBeGreaterThan(beforeRemoval));
		const beforeSource = build.mock.calls.length;
		await writeFile(path.join(root, 'src/index.ts'), 'export const label = 2;');
		await vi.waitFor(() => expect(build.mock.calls.length).toBeGreaterThan(beforeSource));
	} finally {
		await watcher.close();
	}
});
