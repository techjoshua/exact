import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { createLibraryBuildFixture as fixture } from '../test-support/library-build.fixture.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { watchLibraryBuild } from './watch.js';

vi.setConfig({ testTimeout: 30_000 });

it('publishes paired output after shared config edits and recovers from nearer invalid config', async () => {
	const initial = await fixture();
	const workspace = await createTestWorkspace('exact-library-config-parent-');
	const root = path.join(workspace, 'kit');
	await rename(initial.root, root);
	const shared = path.join(workspace, 'exact.config.mjs');
	const nearer = path.join(root, 'exact.config.ts');
	await writeFile(shared, 'export default {};');
	let builds = 0;
	const failures: unknown[] = [];
	const watcher = watchLibraryBuild(
		{ root },
		{
			onBuild: () => {
				builds++;
			},
			onError: (error) => failures.push(error)
		}
	);
	try {
		await watcher.ready;
		expect(builds).toBe(1);
		expect(failures).toEqual([]);
		const beforeEdit = builds;
		await writeFile(shared, 'export default {debug:{}};');
		await vi.waitFor(() => expect(builds).toBeGreaterThan(beforeEdit), { timeout: 15000 });
		const outputs = ['client', 'server'].map((target) =>
			path.join(root, `dist/${target}/Example.js`)
		);
		const previous = await Promise.all(outputs.map((filename) => readFile(filename, 'utf8')));
		await writeFile(
			nearer,
			'import { bad } from "@fixture/missing" with {type:"exact-enhancement",scope:"package"}; export default {};'
		);
		await vi.waitFor(() => expect(failures.length).toBeGreaterThan(0), { timeout: 15000 });
		expect(String(failures[0])).toContain('attributed namespace export');
		expect(await Promise.all(outputs.map((filename) => readFile(filename, 'utf8')))).toEqual(
			previous
		);
		const beforeRecovery = builds;
		await rm(nearer);
		await vi.waitFor(() => expect(builds).toBeGreaterThan(beforeRecovery), { timeout: 15000 });
		await watcher.close();
		const final = builds;
		await writeFile(shared, 'export default {};');
		await new Promise((resolve) => setTimeout(resolve, 450));
		expect(builds).toBe(final);
	} finally {
		await watcher.close();
	}
});
