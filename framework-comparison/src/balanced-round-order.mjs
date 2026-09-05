/**
 * Returns one balanced round without mutating the stable participant inventory.
 * Rotations distribute first, middle, and last positions; alternating cycle direction prevents
 * monotonic host drift from consistently favoring adjacent participants.
 */
export function balancedRoundOrder(participants, round, offset = 0) {
	if (!Array.isArray(participants) || participants.length === 0)
		throw new TypeError('Balanced measurement requires at least one participant');
	if (!Number.isSafeInteger(round) || round < 0)
		throw new TypeError('Balanced measurement round must be a non-negative integer');
	if (!Number.isSafeInteger(offset) || offset < 0)
		throw new TypeError('Balanced measurement offset must be a non-negative integer');
	const start = (round + offset) % participants.length;
	const rotated = [...participants.slice(start), ...participants.slice(0, start)];
	return Math.floor((round + offset) / participants.length) % 2 === 0 ? rotated : rotated.reverse();
}

/** Records stable participant identities for one balanced round. */
export function balancedRoundNames(participants, round, offset = 0) {
	return balancedRoundOrder(participants, round, offset).map((participant) =>
		typeof participant === 'string' ? participant : participant.id
	);
}
