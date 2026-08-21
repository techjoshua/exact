import assert from 'node:assert/strict';
import test from 'node:test';
import { preciseExecutedBytes } from '../src/precise-coverage.mjs';

test('uncalled nested bodies override an executed script range', () => {
	assert.equal(
		preciseExecutedBytes([
			{ startOffset: 0, endOffset: 100, count: 1 },
			{ startOffset: 20, endOffset: 60, count: 0 },
			{ startOffset: 30, endOffset: 40, count: 1 }
		]),
		70
	);
});

test('overlapping executed ranges are counted once', () => {
	assert.equal(
		preciseExecutedBytes([
			{ startOffset: 0, endOffset: 20, count: 1 },
			{ startOffset: 10, endOffset: 30, count: 1 }
		]),
		30
	);
});
