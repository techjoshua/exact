import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ssrWorkerNetworkEnvironment } from '../src/ssr-run-environment.mjs';

describe('SSR worker network environment', () => {
	test('bounds Bun upstream concurrency at the reusable Windows pool capacity', () => {
		assert.deepEqual(ssrWorkerNetworkEnvironment('bun', 'win32'), {
			BUN_CONFIG_MAX_HTTP_REQUESTS: '64'
		});
	});

	test('preserves an explicit Bun request limit', () => {
		assert.deepEqual(ssrWorkerNetworkEnvironment('bun', 'win32', '32'), {
			BUN_CONFIG_MAX_HTTP_REQUESTS: '32'
		});
	});

	test('does not alter Node or non-Windows workers', () => {
		assert.deepEqual(ssrWorkerNetworkEnvironment('node', 'win32'), {});
		assert.deepEqual(ssrWorkerNetworkEnvironment('bun', 'linux'), {});
	});
});
