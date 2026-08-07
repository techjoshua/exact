/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { readExactPartitionDiscriminator } from './framework/hydration.js';

describe('partition marker discriminators', () => {
	it('reads each supported discriminator shape', () => {
		const marker = document.createElement('template');
		marker.setAttribute('data-exact-partition-discriminator', 'single');
		expect(readExactPartitionDiscriminator(marker)).toEqual({ kind: 'single' });

		marker.setAttribute('data-exact-partition-discriminator', 'branch');
		marker.setAttribute('data-exact-partition-branch', 'ready');
		expect(readExactPartitionDiscriminator(marker)).toEqual({ kind: 'branch', branch: 'ready' });

		marker.setAttribute('data-exact-partition-discriminator', 'keyed');
		marker.setAttribute('data-exact-partition-list', 'records');
		marker.setAttribute('data-exact-partition-key', 'record:1');
		expect(readExactPartitionDiscriminator(marker)).toEqual({
			kind: 'keyed',
			list: 'records',
			keyToken: 'record:1'
		});
	});

	it('rejects incomplete or unsupported marker data', () => {
		const marker = document.createElement('template');
		expect(readExactPartitionDiscriminator(marker)).toBeUndefined();
		marker.setAttribute('data-exact-partition-discriminator', 'branch');
		expect(readExactPartitionDiscriminator(marker)).toBeUndefined();
		marker.setAttribute('data-exact-partition-discriminator', 'keyed');
		marker.setAttribute('data-exact-partition-list', 'records');
		expect(readExactPartitionDiscriminator(marker)).toBeUndefined();
	});
});
