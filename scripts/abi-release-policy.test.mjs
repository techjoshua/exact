import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAbiRelease } from './abi-release-policy.mjs';

const policy = { epoch: 1, introduced: '0.5.0', providers: ['@exactjs/core', '@exactjs/dom'] };
const contract = {
	versions: { component: 1, compilerProcess: '1.0.0' },
	component: { render: 1 }
};
const versions = new Map(policy.providers.map((name) => [name, '0.5.0']));

test('compatible runtime updates and additive capability bits retain the epoch', () => {
	assert.doesNotThrow(() =>
		validateAbiRelease(
			policy,
			policy,
			contract,
			{
				versions: { ...contract.versions, compilerProcess: '2.0.0' },
				component: { render: 1, tasks: 2 }
			},
			versions,
			versions
		)
	);
});

test('schema changes, bit reassignment and removal require an ABI epoch', () => {
	for (const next of [
		{ ...contract, versions: { component: 2 } },
		{ ...contract, component: { render: 2 } },
		{ ...contract, component: {} }
	])
		assert.throws(
			() => validateAbiRelease(policy, policy, contract, next, versions, versions),
			/new ABI epoch/
		);
});

test('an ABI break requires all providers to increase their major, even at 0.x', () => {
	const next = { ...policy, epoch: 2 };
	const minor = new Map(policy.providers.map((name) => [name, '0.6.0']));
	assert.throws(
		() => validateAbiRelease(policy, next, contract, contract, versions, minor),
		/major version/
	);
	const major = new Map(policy.providers.map((name) => [name, '1.0.0']));
	assert.doesNotThrow(() => validateAbiRelease(policy, next, contract, contract, versions, major));
	major.set('@exactjs/dom', '0.6.0');
	assert.throws(
		() => validateAbiRelease(policy, next, contract, contract, versions, major),
		/@exactjs\/dom/
	);
});

test('epochs cannot go backwards and providers cannot escape the gate', () => {
	assert.throws(() =>
		validateAbiRelease(policy, { ...policy, epoch: 0 }, contract, contract, versions, versions)
	);
	assert.throws(() =>
		validateAbiRelease(policy, { ...policy, providers: [] }, contract, contract, versions, versions)
	);
});

test('a compatible release cannot retarget or erase its ABI fixture baseline', () => {
	for (const current of [
		{ ...policy, introduced: '0.6.0' },
		{ ...policy, providers: [] }
	])
		assert.throws(() =>
			validateAbiRelease(policy, current, contract, contract, versions, versions)
		);
});
