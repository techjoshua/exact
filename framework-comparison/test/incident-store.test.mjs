import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { IncidentConflictError, IncidentStore } from '../src/incident-store.mjs';

const fixture = JSON.parse(
	await readFile(new URL('../fixtures/baseline.json', import.meta.url), 'utf8')
);

test('claiming advances the authoritative version and publishes one incident event', () => {
	const store = new IncidentStore(fixture, { now: () => '2026-08-11T17:00:00.000Z' });
	const events = [];
	store.subscribe((event) => events.push(event));
	const claimed = store.claimIncident('inc-100', 'user-alex', 1);

	assert.equal(claimed.ownerId, 'user-alex');
	assert.equal(claimed.status, 'investigating');
	assert.equal(claimed.version, 2);
	assert.equal(events.length, 1);
	assert.equal(events[0].type, 'incident');
});

test('a stale claim returns the current incident without mutation', () => {
	const store = new IncidentStore(fixture);
	assert.throws(
		() => store.claimIncident('inc-101', 'user-alex', 0),
		(caught) => caught instanceof IncidentConflictError && caught.current.ownerId === 'user-riley'
	);
	assert.equal(store.getIncident('inc-101').version, 1);
});

test('comments enforce user and Unicode-length boundaries', () => {
	const store = new IncidentStore(fixture, { now: () => '2026-08-11T17:00:00.000Z' });
	assert.throws(() => store.addComment('inc-102', 'user-alex', '   ', 'mutation-1'), /1 to 2,000/);
	assert.throws(
		() => store.addComment('inc-102', 'unknown', 'hello', 'mutation-2'),
		/unknown user/
	);
	const result = store.addComment('inc-102', 'user-alex', '  Investigating now.  ', 'mutation-3');
	assert.equal(result.comment.body, 'Investigating now.');
	assert.equal(result.incident.version, 2);
	const retry = store.addComment('inc-102', 'user-alex', 'ignored retry body', 'mutation-3');
	assert.deepEqual(retry, result);
	assert.equal(store.getIncident('inc-102').comments.length, 1);
	assert.equal(store.getIncident('inc-102').version, 2);
});
