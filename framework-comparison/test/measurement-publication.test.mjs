import assert from 'node:assert/strict';
import test from 'node:test';

import { measurementPublication } from '../src/measurement-publication.mjs';

test('unreviewed participants warn without discarding a local measurement run', () => {
	const warnings = [];
	const result = measurementPublication(
		[
			{ id: 'exact-controlled', status: 'scaffolded' },
			{ id: 'react-controlled', status: 'complete' }
		],
		'browser',
		(message) => warnings.push(message)
	);

	assert.deepEqual(result, { publishable: false, unreviewed: ['exact-controlled'] });
	assert.match(warnings[0], /marked non-publishable/);
});

test('reviewed participants produce publishable metadata without a warning', () => {
	const warnings = [];
	const result = measurementPublication(
		[{ id: 'exact-controlled', status: 'complete' }],
		'SSR',
		(message) => warnings.push(message)
	);

	assert.deepEqual(result, { publishable: true, unreviewed: [] });
	assert.deepEqual(warnings, []);
});
