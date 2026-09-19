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

test('an ABI break requires every 0.x provider to increase its minor or major', () => {
	const next = { ...policy, epoch: 2 };
	const minor = new Map(policy.providers.map((name) => [name, '0.6.0']));
	assert.doesNotThrow(() => validateAbiRelease(policy, next, contract, contract, versions, minor));
	const major = new Map(policy.providers.map((name) => [name, '1.0.0']));
	assert.doesNotThrow(() => validateAbiRelease(policy, next, contract, contract, versions, major));
	for (const version of ['0.5.0', '0.5.1', '0.4.9']) {
		minor.set('@exactjs/dom', version);
		assert.throws(
			() => validateAbiRelease(policy, next, contract, contract, versions, minor),
			/@exactjs\/dom/
		);
	}
});

test('an ABI break at 1.0 and later requires every provider to increase its major', () => {
	const previous = new Map(policy.providers.map((name) => [name, '1.2.0']));
	const current = new Map(policy.providers.map((name) => [name, '2.0.0']));
	const next = { ...policy, epoch: 2 };
	assert.doesNotThrow(() =>
		validateAbiRelease(policy, next, contract, contract, previous, current)
	);
	for (const version of ['1.2.1', '1.3.0', '0.6.0']) {
		current.set('@exactjs/dom', version);
		assert.throws(
			() => validateAbiRelease(policy, next, contract, contract, previous, current),
			/@exactjs\/dom/
		);
	}
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
