import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { compilerAbiOutputs } from './compiler-abi-contract.mjs';

test('Go and TypeScript compiler ABI constants come from one contract', async () => {
	for (const [filename, expected] of await compilerAbiOutputs(path.resolve('.'))) {
		assert.equal(await readFile(filename, 'utf8'), expected, `${filename} is stale`);
	}
});
