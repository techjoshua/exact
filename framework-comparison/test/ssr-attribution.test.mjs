import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import {
	measureSsrRequest,
	resetSsrClientConnections,
	runConcurrentSsrRequests,
	runSsrBurst,
	runSustainedSsrWindow
} from '../src/ssr-benchmark-client.mjs';
import { profileNodeAllocations, profileNodeCpu } from '../src/ssr-allocation-profiler.mjs';
import {
	balancedParticipantOrder,
	probeControlledService,
	rotateParticipants
} from '../src/ssr-controlled-service-probe.mjs';

describe('SSR attribution diagnostics', () => {
	let server;
	let url;
	let connectionCount = 0;

	before(async () => {
		server = createServer((request, response) => {
			if (request.url === '/api/session' || request.url === '/api/incidents') {
				response.writeHead(200, { 'content-type': 'application/json' });
				response.end('{}');
				return;
			}
			response.writeHead(200, { 'content-type': 'text/html' });
			response.end('<p>Delayed fulfillment events</p>');
		});
		server.on('connection', () => connectionCount++);
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		url = `http://127.0.0.1:${server.address().port}`;
	});

	after(() => {
		resetSsrClientConnections();
		return new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve()))
		);
	});

	it('measures finite and sustained closed-loop request populations', async () => {
		const sample = await measureSsrRequest(url);
		assert.equal(sample.meaningful, true);
		assert.equal((await runConcurrentSsrRequests(url, 4, 2)).length, 4);
		const burst = await runSsrBurst(url, 4, 2);
		assert.equal(burst.samples.length, 4);
		assert.ok(burst.elapsedMs >= Math.max(...burst.samples.map((entry) => entry.totalMs)));
		assert.ok(burst.samples.every((entry) => entry.hash === sample.hash && entry.meaningful));
		const sustained = await runSustainedSsrWindow(url, 2, 20);
		assert.ok(sustained.samples.length >= 2);
		assert.ok(sustained.elapsedMs >= 20);
		assert.ok(sustained.requestsPerSecond > 0);
		assert.equal(
			sustained.requestsPerSecond,
			(sustained.samples.length / sustained.elapsedMs) * 1000
		);
		assert.ok(sustained.samples.every((entry) => entry.hash === sample.hash && entry.meaningful));
		assert.ok(
			connectionCount <= 2,
			`expected socket reuse, observed ${connectionCount} connections`
		);
	});

	it('warms both controlled-service resources and rotates stable participant order', async () => {
		const probe = await probeControlledService(url, 3);
		assert.equal(probe.samplesMs.length, 3);
		assert.deepEqual(rotateParticipants(['exact', 'react', 'svelte', 'nuxt'], 1), [
			'react',
			'svelte',
			'nuxt',
			'exact'
		]);
		assert.deepEqual(balancedParticipantOrder(['exact', 'react', 'svelte', 'nuxt'], 2), [
			'svelte',
			'nuxt',
			'exact',
			'react'
		]);
		assert.throws(() => balancedParticipantOrder(['exact', 'react'], -1), /non-negative integer/);
	});

	it('captures Node allocation samples around a diagnostic operation', async () => {
		const retained = [];
		const profile = await profileNodeAllocations(() => {
			for (let index = 0; index < 200; index++) retained.push({ index, value: 'x'.repeat(128) });
			return retained.length;
		}, 512);
		assert.equal(profile.supported, true);
		assert.equal(profile.value, 200);
		assert.ok(profile.summary.sampleCount > 0);
	});

	it('captures Node CPU samples around a diagnostic operation', async () => {
		const profile = await profileNodeCpu(() => {
			let total = 0;
			for (let index = 0; index < 1_000_000; index++) total += Math.sqrt(index);
			return total;
		});
		assert.equal(profile.supported, true);
		assert.ok(profile.value > 0);
		assert.ok(profile.summary.totalSamples > 0);
	});
});
