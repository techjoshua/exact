import { readdir } from 'node:fs/promises';
import {
	loadJsonContract,
	validateFixture,
	validateParticipant,
	validateReview,
	validateScenarios
} from './contract.mjs';

const fixture = await loadJsonContract(
	new URL('../fixtures/baseline.json', import.meta.url),
	validateFixture
);
const fixtureIds = validateFixture(fixture);
const catalog = await loadJsonContract(
	new URL('../specification/scenarios.json', import.meta.url),
	(value) => validateScenarios(value, fixtureIds)
);
await loadJsonContract(
	new URL('../participants/participant.example.json', import.meta.url),
	validateParticipant
);

const participantDirectory = new URL('../participants/', import.meta.url);
const entries = await readdir(participantDirectory, { withFileTypes: true });
let participants = 0;
for (const entry of entries) {
	if (!entry.isDirectory()) continue;
	const participant = await loadJsonContract(
		new URL(`${entry.name}/participant.json`, participantDirectory),
		validateParticipant
	);
	const review = await loadJsonContract(
		new URL(`${entry.name}/review.json`, participantDirectory),
		(value) => validateReview(value, participant.id)
	);
	if (participant.status === 'complete' && review.status !== 'approved')
		throw new Error(
			`complete participant ${participant.id} requires an approved specialist review`
		);
	participants += 1;
}

console.log(
	`Framework comparison contracts valid: ${fixture.incidents.length} incidents, ${catalog.scenarios.length} scenarios, ${participants} participants.`
);
