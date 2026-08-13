import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createComparisonService } from '../src/service.mjs';

const fixture = JSON.parse(
	await readFile(new URL('../fixtures/baseline.json', import.meta.url), 'utf8')
);

function post(path, value, headers = {}) {
	return new Request(`http://comparison.test${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(value)
	});
}

test('the controlled service exposes queue, mutation, conflict, and reset behavior', async (context) => {
	const service = createComparisonService(fixture);
	context.after(() => service.dispose());

	const queue = await service.fetch(new Request('http://comparison.test/api/incidents'));
	assert.deepEqual(
		(await queue.json()).incidents.map((incident) => incident.id),
		['inc-100', 'inc-101', 'inc-102']
	);

	const claim = await service.fetch(
		post('/api/incidents/inc-100/claim', { actorId: 'user-alex', expectedVersion: 1 })
	);
	assert.equal(claim.status, 200);
	assert.equal((await claim.json()).incident.version, 2);

	const conflict = await service.fetch(
		post('/api/incidents/inc-100/claim', { actorId: 'user-riley', expectedVersion: 1 })
	);
	assert.equal(conflict.status, 409);
	assert.equal((await conflict.json()).error.current.ownerId, 'user-alex');

	const forbiddenReset = await service.fetch(post('/__benchmark/reset', {}));
	assert.equal(forbiddenReset.status, 403);
	const reset = await service.fetch(
		post('/__benchmark/reset', {}, { 'x-benchmark-control': 'fixture-reset' })
	);
	assert.equal(reset.status, 200);
	assert.equal(service.store.getIncident('inc-100').version, 1);
});

test('browser preflight and idempotent comment retries are explicit service contracts', async (context) => {
	const service = createComparisonService(fixture);
	context.after(() => service.dispose());

	const preflight = await service.fetch(
		new Request('http://comparison.test/api/incidents/inc-102/comments', { method: 'OPTIONS' })
	);
	assert.equal(preflight.status, 204);
	assert.equal(preflight.headers.get('access-control-allow-origin'), '*');

	const mutation = {
		actorId: 'user-alex',
		body: 'Checking the index workers.',
		clientMutationId: 'comment-attempt-1'
	};
	const first = await service.fetch(post('/api/incidents/inc-102/comments', mutation));
	const retry = await service.fetch(post('/api/incidents/inc-102/comments', mutation));
	assert.equal(first.status, 201);
	assert.deepEqual(await retry.json(), await first.json());
	assert.equal(service.store.getIncident('inc-102').comments.length, 1);
});

test('analysis jobs progress asynchronously to an authoritative result', async (context) => {
	const service = createComparisonService(fixture, { analysisDelayMs: 2 });
	context.after(() => service.dispose());
	const response = await service.fetch(post('/api/incidents/inc-100/analysis', {}));
	assert.equal(response.status, 202);
	const { job } = await response.json();
	assert.equal(job.status, 'queued');

	await new Promise((resolve) => setTimeout(resolve, 12));
	const completed = await service.fetch(new Request(`http://comparison.test/api/jobs/${job.id}`));
	assert.equal((await completed.json()).job.status, 'completed');
});
