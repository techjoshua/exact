import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveReleaseRevision } from './release-revision.mjs';

test('release revisions honor rewritten history without accepting missing baselines', async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'exact-release-revision-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const git = (...args) =>
		execFileSync('git', args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		}).trim();
	git('init');
	git(
		'-c',
		'user.name=Test',
		'-c',
		'user.email=test@example.invalid',
		'commit',
		'--allow-empty',
		'-m',
		'old'
	);
	const old = git('rev-parse', 'HEAD');
	git(
		'-c',
		'user.name=Test',
		'-c',
		'user.email=test@example.invalid',
		'commit',
		'--allow-empty',
		'-m',
		'replacement'
	);
	const head = git('rev-parse', 'HEAD');
	git('tag', 'release', old);
	assert.equal(resolveReleaseRevision(root, 'release'), old);
	await mkdir(path.join(root, 'docs'));
	const missing = 'a'.repeat(40);
	await writeFile(
		path.join(root, 'docs/history-revisions.txt'),
		`# recorded rewrite\n${old} ${head}\n${missing} ${head}\n`
	);
	assert.equal(resolveReleaseRevision(root, old), head);
	assert.equal(resolveReleaseRevision(root, missing), head);
	assert.equal(resolveReleaseRevision(root, 'HEAD'), head);
	assert.equal(resolveReleaseRevision(root, 'release'), old);
	assert.throws(() => resolveReleaseRevision(root, 'b'.repeat(40)));
	assert.throws(() => resolveReleaseRevision(root, 'missing-tag'));
	await writeFile(path.join(root, 'docs/history-revisions.txt'), `${missing} ${'b'.repeat(40)}\n`);
	assert.throws(() => resolveReleaseRevision(root, missing));
});
