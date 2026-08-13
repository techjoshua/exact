import assert from 'node:assert/strict';
import test from 'node:test';
import { startComparisonServer } from '../src/server.mjs';

test('the Node adapter serves the controlled contract on an available port', async (context) => {
	const running = await startComparisonServer({ port: 0 });
	context.after(() => running.close());

	const health = await fetch(`${running.url}/health`);
	assert.equal(health.status, 200);
	assert.deepEqual(await health.json(), { status: 'ready' });

	const incident = await fetch(`${running.url}/api/incidents/inc-100`);
	assert.equal((await incident.json()).incident.version, 1);
});
