import { expect, it } from 'vitest';
import { isExactProgressEvent } from './progress.js';

const event = {
	event: 'progress',
	version: 1,
	index: 0,
	type: 'invoke',
	id: 'save',
	receiver: 'progress'
};

it.each([undefined, NaN, Infinity, -Infinity, -0])(
	'accepts a restored constant snapshot (%s)',
	(snapshot) => {
		expect(isExactProgressEvent({ ...event, snapshot })).toBe(true);
	}
);

it('requires an owned snapshot and retains rejection of unsupported values', () => {
	expect(isExactProgressEvent(event)).toBe(false);
	expect(isExactProgressEvent(Object.assign(Object.create({ snapshot: undefined }), event))).toBe(
		false
	);
	for (const snapshot of [Symbol('unsupported'), 1n, () => 1])
		expect(isExactProgressEvent({ ...event, snapshot })).toBe(false);
});
