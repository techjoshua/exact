import { expect, it } from 'vitest';
import { minimizeFailingSequence, seededChoices } from '../test-support/sequence-model.js';

it('replays seeded choices and reduces a failure without removing its prerequisite', async () => {
	const first = seededChoices(391),
		second = seededChoices(391);
	expect(Array.from({ length: 64 }, () => first(19))).toEqual(
		Array.from({ length: 64 }, () => second(19))
	);
	const original = ['noise', 'start', 'noise', 'cancel', 'noise'];
	const reduced = await minimizeFailingSequence(
		original,
		(commands) =>
			commands.indexOf('start') >= 0 && commands.indexOf('cancel') > commands.indexOf('start')
	);
	expect(reduced).toEqual(['start', 'cancel']);
	expect(original).toHaveLength(5);
});

it('bounds reduction attempts when every candidate still fails', async () => {
	let attempts = 0;
	const reduced = await minimizeFailingSequence(
		[1, 2, 3, 4, 5],
		() => {
			attempts++;
			return true;
		},
		2
	);
	expect(attempts).toBe(2);
	expect(reduced.length).toBeLessThan(5);
});
