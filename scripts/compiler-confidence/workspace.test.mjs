import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { withNativeCoverageWorkspace, reclaimNativeCoverageWorkspaces } from './workspace.mjs';

for (const failure of [false, true]) {
	test(`isolates and releases coverage cache and temporary storage on ${failure ? 'failure' : 'success'}`, async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'coverage-workspace-test-'));
		try {
			const shared = path.join(directory, 'shared');
			await mkdir(shared);
			await writeFile(path.join(shared, 'sentinel'), 'retained');
			const environment = { GOCACHE: shared, TMPDIR: shared };
			const result = withNativeCoverageWorkspace(directory, environment, async (env) => {
				assert.notEqual(env.GOCACHE, shared);
				assert.notEqual(env.TMPDIR, shared);
				assert.equal(env.TEMP, env.TMPDIR);
				assert.equal(env.TMP, env.TMPDIR);
				await mkdir(env.GOCACHE);
				await writeFile(path.join(env.GOCACHE, 'instrumented-build'), 'cache');
				await writeFile(path.join(env.TMPDIR, 'copied-source'), 'source');
				if (failure) throw new Error('coverage failed');
				return 7;
			});
			if (failure) await assert.rejects(result, /coverage failed/);
			else assert.equal(await result, 7);
			assert.deepEqual(await readdir(directory), ['shared']);
			assert.equal(await readFile(path.join(shared, 'sentinel'), 'utf8'), 'retained');
			assert.deepEqual(environment, { GOCACHE: shared, TMPDIR: shared });
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
}

test('reclaims dead owners while preserving active and unrelated entries', async () => {
	const directory = await mkdtemp(path.join(tmpdir(), 'coverage-reclaim-test-'));
	try {
		const child = spawn(process.execPath, ['-e', '']);
		await once(child, 'close');
		for (const name of [`run-${child.pid}-dead`, `run-${process.pid}-active`, 'reports'])
			await mkdir(path.join(directory, name));
		await reclaimNativeCoverageWorkspaces(directory);
		assert.deepEqual(
			(await readdir(directory)).sort(),
			['reports', `run-${process.pid}-active`].sort()
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test(
	'handled termination stops the command before releasing its workspace',
	{ skip: process.platform === 'win32' },
	async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'coverage-interrupt-test-'));
		const workspaceModule = new URL('./workspace.mjs', import.meta.url).href;
		const processModule = new URL('./process.mjs', import.meta.url).href;
		const source = `import {withNativeCoverageWorkspace} from ${JSON.stringify(workspaceModule)};
import {run} from ${JSON.stringify(processModule)};
try {await withNativeCoverageWorkspace(process.argv[1],process.env,env=>run(process.execPath,['-e','console.log("ready");setInterval(()=>{},1000)'],process.cwd(),env));} catch {}`;
		try {
			const child = spawn(process.execPath, ['--input-type=module', '-e', source, directory]);
			const closed = once(child, 'close');
			await once(child.stdout, 'data');
			child.kill('SIGTERM');
			const [code] = await closed;
			assert.equal(code, 143);
			assert.deepEqual(await readdir(directory), []);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	}
);
