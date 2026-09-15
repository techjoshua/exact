import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNpmPackageMetadata } from './npm-package-metadata.mjs';

const entry = {
	relativePath: 'packages/core/package.json',
	manifest: {
		name: '@exactjs/core',
		description: 'eXact component primitives.',
		keywords: ['exactjs', 'components'],
		license: 'Apache-2.0',
		author: 'Joshua Friesen',
		repository: {
			type: 'git',
			url: 'git+https://github.com/techjoshua/exact.git',
			directory: 'packages/core'
		},
		homepage: 'https://techjoshua.github.io/exact/#/learn/components',
		bugs: { url: 'https://github.com/techjoshua/exact/issues' }
	}
};

test('complete source metadata passes without built artifacts', () => {
	assert.deepEqual(validateNpmPackageMetadata(entry), []);
});

test('missing metadata and incorrect monorepo links fail release validation', () => {
	for (const field of Object.keys(entry.manifest).filter((field) => field !== 'name')) {
		const manifest = { ...entry.manifest, [field]: undefined };
		assert.ok(validateNpmPackageMetadata({ ...entry, manifest }).length, field);
	}
	for (const keywords of [[], ['exactjs'], ['exactjs', 'exactjs'], ['exactjs', ' ']])
		assert.ok(
			validateNpmPackageMetadata({ ...entry, manifest: { ...entry.manifest, keywords } }).length
		);
	assert.ok(
		validateNpmPackageMetadata({ ...entry, relativePath: 'packages/forms/package.json' }).length
	);
});
