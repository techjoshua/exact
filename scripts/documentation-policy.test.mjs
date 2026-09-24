import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
	checkDocumentation,
	markdownAnchors,
	markdownLinks,
	generatedReportViolation
} from './documentation-policy.mjs';
import { validateDocNavigation } from '../apps/docs/scripts/check-navigation.mjs';

test('recognizes duplicate headings, explicit anchors, and reference links outside examples', () => {
	assert.deepEqual(
		[...markdownAnchors('# One\n## One\n<a id="manual"></a>\n```md\n# Hidden\n```')],
		['one', 'one-1', 'manual']
	);
	assert.deepEqual(
		markdownLinks('[one](./one.md#one)\n[two][t]\n[t]: two.md\n```md\n[x](missing)\n```'),
		['./one.md#one', 'two.md']
	);
	assert.throws(() => markdownLinks('[missing][reference]'), /Undefined/);
});

test('findings remain immutable while linked corrections and valid anchors pass', async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-doc-policy-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
	await mkdir(path.join(root, 'docs/findings'), { recursive: true });
	const finding = path.join(root, 'docs/findings/original.md');
	await writeFile(finding, '# Finding\nOriginal evidence.\n');
	git('init');
	git('add', '.');
	git(
		'-c',
		'user.name=Fixture',
		'-c',
		'user.email=fixture@example.invalid',
		'commit',
		'-m',
		'fixture'
	);
	await writeFile(
		path.join(root, 'docs/correction.md'),
		'[Correction](findings/original.md#finding)\n'
	);
	await checkDocumentation(root);
	await writeFile(
		path.join(root, 'docs/correction.md'),
		'[Broken](findings/original.md#missing)\n'
	);
	await assert.rejects(checkDocumentation(root), /missing anchor/);
	await writeFile(path.join(root, 'docs/correction.md'), '[Broken](missing.md)\n');
	await assert.rejects(checkDocumentation(root), /missing local target/);
	await rm(path.join(root, 'docs/correction.md'));
	await writeFile(finding, '# Finding\nChanged.\n');
	await assert.rejects(checkDocumentation(root), /immutable finding changed/);
	await rm(finding);
	await assert.rejects(checkDocumentation(root), /ENOENT|immutable finding changed/);
});

test('rejects generated metric reports while allowing explanatory tables', () => {
	assert.ok(
		generatedReportViolation('Generated benchmark report\n| Framework | RPS |\n| A | 12000 |')
	);
	assert.ok(generatedReportViolation('```json\n{"samplesMs": [1,2,3]}\n```'));
	assert.equal(
		generatedReportViolation('| Metric | Meaning |\n| RPS | Requests per second |'),
		undefined
	);
});

test('navigation requires unique paths, registered pages, and complete search metadata', () => {
	const page = {
		path: '/',
		label: 'Home',
		summary: 'Introduction',
		keywords: 'start',
		component: 'Home'
	};
	const group = (pages) => [{ label: 'Learn', pages }];
	validateDocNavigation(group([page]), new Set(['Home']));
	assert.throws(() => validateDocNavigation(group([page, page]), new Set(['Home'])), /duplicate/);
	assert.throws(() => validateDocNavigation(group([page]), new Set(['Other'])), /Unregistered/);
	assert.throws(
		() => validateDocNavigation(group([{ ...page, keywords: '' }]), new Set(['Home'])),
		/metadata/
	);
	assert.throws(() => validateDocNavigation(group([page]), new Set(['Home', 'Unused'])), /absent/);
});
