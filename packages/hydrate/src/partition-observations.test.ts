// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { verifyPartitionObservations } from '../../component-composition-corpus/test-support/partition-observation-journey.mjs';
import { inspectExactPartitionInstances } from './partition-instances.js';

it('returns ordinary detached partition trees while revalidating live marker authority', () => {
	expect(verifyPartitionObservations({ inspect: inspectExactPartitionInstances })).toBe(true);
});
