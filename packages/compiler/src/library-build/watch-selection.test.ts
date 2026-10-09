import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildLibrary } from './build.js';
import { watchLibraryBuild } from './watch.js';
import { createTestWorkspace } from '../test-support/workspace.js';

vi.mock('./build.js', () => ({ buildLibrary: vi.fn(async () => {}) }));

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
