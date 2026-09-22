import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeProfile } from './profile-summary.mjs';

test('phase attribution excludes setup and counts recursive inclusive stacks once', () => {
	const frame = (functionName) => ({ functionName });
	const profile = {
		startTime: 100,
		nodes: [
			{ id: 1, callFrame: frame('root'), children: [2] },
			{ id: 2, callFrame: frame('lookup'), children: [3] },
			{ id: 3, callFrame: frame('lookup'), children: [] }
		],
		samples: [1, 3, 2, 1, 3],
		timeDeltas: [10, 10, 10, 10, 10]
	};
	const summary = summarizeProfile(profile, [
		{ phase: 'mount', start: 120, end: 140 },
		{ phase: 'update', start: 150, end: 160 }
	]);
	assert.equal(summary.mount.samples, 2);
	assert.deepEqual(
		summary.mount.rows.find((row) => row.functionName === 'lookup'),
		{
			functionName: 'lookup',
			self: 2,
			inclusive: 2
		}
	);
	assert.equal(summary.update.samples, 1);
	assert.equal(summary.update.rows.find((row) => row.functionName === 'root').self, 0);
});
