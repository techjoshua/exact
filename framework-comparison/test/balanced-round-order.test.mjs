import assert from 'node:assert/strict';
import test from 'node:test';

import { balancedRoundNames, balancedRoundOrder } from '../src/balanced-round-order.mjs';

test('balances positions and reverses alternating rotation cycles', () => {
	const participants = ['exact', 'react', 'sveltekit', 'nuxt'];
	const rounds = Array.from({ length: 8 }, (_, round) => balancedRoundOrder(participants, round));
	assert.deepEqual(rounds[0], ['exact', 'react', 'sveltekit', 'nuxt']);
	assert.deepEqual(rounds[4], ['nuxt', 'sveltekit', 'react', 'exact']);
	for (const participant of participants)
		for (let position = 0; position < participants.length; position++)
			assert.equal(
				rounds.filter((order) => order[position] === participant).length,
				2,
				`${participant} position ${position}`
			);
});

test('names object participants and rejects invalid rounds', () => {
	assert.deepEqual(balancedRoundNames([{ id: 'exact' }, { id: 'react' }], 1), ['react', 'exact']);
	assert.throws(() => balancedRoundOrder([], 0), /at least one participant/);
	assert.throws(() => balancedRoundOrder(['exact'], -1), /non-negative integer/);
});

test('distributes five participants across every order position', () => {
	const participants = ['exact', 'react', 'sveltekit', 'nuxt', 'tanstack-start'];
	const rounds = Array.from({ length: 10 }, (_, round) => balancedRoundOrder(participants, round));
	for (const participant of participants) {
		const positions = rounds
			.map((order) => order.indexOf(participant))
			.sort((left, right) => left - right);
		assert.deepEqual(positions, [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
	}
});
