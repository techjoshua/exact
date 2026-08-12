import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateFixture, validateParticipant, validateScenarios } from '../src/contract.mjs';

const fixture = JSON.parse(
	await readFile(new URL('../fixtures/baseline.json', import.meta.url), 'utf8')
);

test('the checked-in fixture and scenario catalog form one valid contract', async () => {
	const ids = validateFixture(fixture);
	const catalog = JSON.parse(
		await readFile(new URL('../specification/scenarios.json', import.meta.url), 'utf8')
	);
	const scenarios = validateScenarios(catalog, ids);
	assert.equal(ids.incidentIds.size, 3);
	assert.equal(scenarios.scenarioIds.size, 5);
});

test('fixture validation rejects duplicate identity and unknown ownership', () => {
	const duplicate = structuredClone(fixture);
	duplicate.users.push(structuredClone(duplicate.users[0]));
	assert.throws(() => validateFixture(duplicate), /duplicate id/);

	const unknownOwner = structuredClone(fixture);
	unknownOwner.incidents[0].ownerId = 'unknown';
	assert.throws(() => validateFixture(unknownOwner), /unknown owner/);
});

test('participant metadata cannot claim an unknown track', () => {
	assert.throws(
		() =>
			validateParticipant({
				schemaVersion: 1,
				id: 'bad',
				framework: 'Bad',
				frameworkVersion: '1.0.0',
				status: 'complete',
				tracks: ['invented'],
				runtime: 'node-24',
				commands: { build: 'build', start: 'start' },
				baseUrl: 'http://127.0.0.1:1',
				sourceRoots: ['src']
			}),
		/invalid track/
	);
});
