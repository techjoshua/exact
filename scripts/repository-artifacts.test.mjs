import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { artifactViolation, checkRepositoryArtifacts } from './repository-artifacts.mjs';

test('admits bounded summaries and intentional source fixtures but rejects run artifacts', () => {
	for (const filename of [
		'docs/performance-baselines/results.json',
		'docs/performance-baselines/native-compiler-corpus.json',
		'docs/performance-baselines/component-local-target-abi/phase-0-impact.json',
		'fixtures/release-abi/0.5.0/client.js',
		'apps/docs/src/data/performance-report.json'
	])
		assert.equal(artifactViolation(filename, 1024), undefined, filename);
	for (const filename of [
		'docs/performance-baselines/new-run.json',
		'docs/performance-baselines/new-run.md',
		'framework-comparison/results/capture.json',
		'docs/renamed-evidence.zip',
		'profiles/run.cpuprofile',
		'.tmp/run.json',
		'packages/core/dist/index.js',
		'.svelte-kit/generated/app.js',
		'output/capture.json'
	])
		assert.ok(artifactViolation(filename, 10), filename);
	assert.ok(artifactViolation('docs/performance-baselines/results.json', 1024 * 1024 + 1));
	assert.ok(artifactViolation('renamed-payload.json', 1024 * 1024 + 1));
	assert.equal(
		artifactViolation('apps/shipping-calculator/src/data/zcta-centroids.json', 1181806),
		undefined
	);
	assert.ok(
		artifactViolation('apps/shipping-calculator/src/data/zcta-centroids.json', 1536 * 1024 + 1)
	);
});

test('checks staged content, forced ignored additions, and artifacts removed before the PR tip', async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-artifact-policy-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const git = (...args) =>
		execFileSync('git', args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe']
		}).trim();
	const commit = (message) =>
		git(
			'-c',
			'user.name=Artifact policy test',
			'-c',
			'user.email=artifact-test@example.invalid',
			'commit',
			'-m',
			message
		);
	git('init');
	await writeFile(path.join(root, '.gitignore'), '.tmp/\n');
	git('add', '.gitignore');
	commit('initial');
	const base = git('rev-parse', 'HEAD');
	await mkdir(path.join(root, '.tmp'));
	const filename = '.tmp/run with\nnewline.json';
	await writeFile(path.join(root, filename), '{}');
	assert.deepEqual(checkRepositoryArtifacts(root), []);
	git('add', '-f', '--', filename);
	assert.equal(checkRepositoryArtifacts(root)[0].filename, filename);
	commit('accidental capture');
	git('rm', '--', filename);
	commit('remove capture');
	assert.deepEqual(checkRepositoryArtifacts(root), []);
	assert.equal(checkRepositoryArtifacts(root, { base })[0].filename, filename);
	assert.throws(() => checkRepositoryArtifacts(root, { base: 'missing-revision' }));
	await writeFile(path.join(root, 'large.json'), 'x'.repeat(1024 * 1024 + 1));
	git('add', 'large.json');
	await writeFile(path.join(root, 'large.json'), '{}');
	assert.equal(checkRepositoryArtifacts(root)[0].filename, 'large.json');
});
