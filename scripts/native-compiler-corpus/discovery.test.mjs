import assert from 'node:assert/strict';
import test from 'node:test';

import { isExcludedNativeCompilerCorpusDirectory } from './discovery.mjs';

test('excludes standard and target-specific generated distribution directories', () => {
	assert.equal(isExcludedNativeCompilerCorpusDirectory('dist'), true);
	assert.equal(isExcludedNativeCompilerCorpusDirectory('dist-server'), true);
	assert.equal(isExcludedNativeCompilerCorpusDirectory('dist-client'), true);
	assert.equal(isExcludedNativeCompilerCorpusDirectory('src'), false);
});

test('keeps explicit test infrastructure outside the production native corpus', () => {
	assert.equal(isExcludedNativeCompilerCorpusDirectory('test-support'), true);
	assert.equal(isExcludedNativeCompilerCorpusDirectory('testing'), false);
});
