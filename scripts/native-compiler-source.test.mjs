import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { prepareNativeCompilerSource } from './native-compiler-source.mjs';

test('an explicit native compiler source is used without bootstrapping', async () => {
	let checkoutCalled = false;
	const source = await prepareNativeCompilerSource({
		explicitSource: 'custom/typescript-go',
		repositoryRoot: path.resolve('repository'),
		checkout: async () => {
			checkoutCalled = true;
		}
	});

	assert.equal(source, path.resolve('custom/typescript-go'));
	assert.equal(checkoutCalled, false);
});

test('an existing default TypeScript-Go checkout is reused', async () => {
	let checkoutCalled = false;
	let inspectedPath;
	const repositoryRoot = path.resolve('repository');
	const source = await prepareNativeCompilerSource({
		repositoryRoot,
		sourceExists: async (filename) => {
			inspectedPath = filename;
			return true;
		},
		checkout: async () => {
			checkoutCalled = true;
		}
	});

	assert.equal(source, path.join(repositoryRoot, '.tmp', 'typescript-go-source'));
	assert.equal(inspectedPath, path.join(source, '.git'));
	assert.equal(checkoutCalled, false);
});

test('a missing default TypeScript-Go checkout is bootstrapped', async () => {
	let checkoutDestination;
	const repositoryRoot = path.resolve('repository');
	const source = await prepareNativeCompilerSource({
		repositoryRoot,
		sourceExists: async () => false,
		checkout: async (destination) => {
			checkoutDestination = destination;
		}
	});

	assert.equal(source, path.join(repositoryRoot, '.tmp', 'typescript-go-source'));
	assert.equal(checkoutDestination, source);
});
