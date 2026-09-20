import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNpmPackOutput } from './npm-pack-output.mjs';

const name = '@exactjs/example';
const pack = { name, entryCount: 2, files: [{ path: 'package.json' }, { path: 'LICENSE' }] };

test('npm pack inventories preserve files from array and name-keyed output', () => {
	for (const value of [[pack], { [name]: pack }])
		assert.deepEqual(parseNpmPackOutput(JSON.stringify(value), name), pack);
});

test('missing, ambiguous, or wrong-package inventories cannot pass release checks', () => {
	for (const value of [
		null,
		1,
		'',
		[],
		{},
		[pack, pack],
		{ [name]: pack, other: pack },
		{ other: pack },
		[{ ...pack, name: 'other' }],
		{ [name]: { ...pack, name: 'other' } },
		{ error: { code: 'E404' } }
	])
		assert.throws(() => parseNpmPackOutput(JSON.stringify(value), name), /Invalid npm pack/);
	assert.throws(() => parseNpmPackOutput('not json', name), SyntaxError);
});

test('malformed file inventories fail in both supported output shapes', () => {
	for (const value of [
		null,
		{},
		{ ...pack, files: [] },
		{ ...pack, files: undefined },
		{ ...pack, files: [null, { path: 'LICENSE' }] },
		{ ...pack, files: [{ path: 1 }, { path: 'LICENSE' }] },
		{ ...pack, files: [{ path: '' }, { path: 'LICENSE' }] },
		{ ...pack, entryCount: 1 },
		{ ...pack, entryCount: undefined }
	])
		for (const output of [[value], { [name]: value }])
			assert.throws(() => parseNpmPackOutput(JSON.stringify(output), name), /Invalid npm pack/);
});
