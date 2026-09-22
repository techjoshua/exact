import assert from 'node:assert/strict';
import test from 'node:test';
import {
	assertComparisonNetwork,
	readComparisonNetworkEnvironment
} from '../src/network-environment.mjs';

const local = { dst: '127.0.0.1', type: 'local', dev: 'lo', table: 'local' };
const mirrored = { dst: '127.0.0.1', dev: 'loopback0', table: '127', gateway: '169.254.1.1' };

function inspect(routes, options = {}) {
	return readComparisonNetworkEnvironment({
		platform: 'linux',
		readRoute: () => JSON.stringify(routes),
		readNamespace: () => 'net:[test]',
		allowRoutedLoopback: false,
		...options
	});
}

test('accepts native loopback and retains route and namespace evidence', () => {
	const environment = inspect([local]);
	assert.equal(assertComparisonNetwork(environment), environment);
	assert.equal(environment.status, 'native-loopback');
	assert.equal(environment.namespace, 'net:[test]');
	assert.equal(environment.route.device, 'lo');
});

test('rejects mirrored IPv4 routing even though the address is loopback', () => {
	const environment = inspect([mirrored]);
	assert.equal(environment.status, 'routed-loopback');
	assert.throws(() => assertComparisonNetwork(environment), /loopback0 via 169\.254\.1\.1/);
});

test('records an explicit experiment override without relabeling the route', () => {
	const environment = inspect([mirrored], { allowRoutedLoopback: true });
	assert.equal(assertComparisonNetwork(environment), environment);
	assert.equal(environment.status, 'routed-loopback');
	assert.equal(environment.allowRoutedLoopback, true);
});

test('rejects malformed, missing, and failed Linux route probes', () => {
	for (const routes of [
		[],
		{},
		[null],
		[local, local],
		[{ ...local, dst: 'other' }],
		[{ dst: local.dst }]
	]) {
		const environment = inspect(routes);
		assert.equal(environment.status, 'unverified');
		assert.throws(() => assertComparisonNetwork(environment), /Invalid IPv4 loopback route probe/);
	}
	for (const readRoute of [
		() => 'not JSON',
		() => {
			throw new Error('ip unavailable');
		}
	]) {
		const environment = inspect([], { readRoute });
		assert.equal(environment.status, 'unverified');
		assert.throws(() => assertComparisonNetwork(environment), /requires native Linux loopback/);
	}
});

test('does not require namespace inspection to verify a local route', () => {
	const environment = inspect([local], {
		readNamespace() {
			throw new Error('namespace unavailable');
		}
	});
	assert.equal(assertComparisonNetwork(environment).namespace, null);
});

test('does not claim Linux route verification on other platforms', () => {
	for (const platform of ['win32', 'darwin']) {
		const environment = inspect([], {
			platform,
			readRoute() {
				throw new Error('must not probe');
			}
		});
		assert.equal(assertComparisonNetwork(environment).status, 'not-probed');
	}
});
