import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installDevelopmentProcessLifecycle } from '../../scripts/development-process-lifecycle.mjs';
import { assertComparisonNetwork } from './network-environment.mjs';
import { validateSsrArrivalPlan, ssrArrivalCases } from './ssr-arrival-plan.mjs';
import { ssrRenderMode } from './ssr-render-mode.mjs';
import { startSsrLoadProcess } from './ssr-load-process-owner.mjs';
import { startSsrWorker, stopSsrWorker, controlSsrWorker } from './ssr-worker-controller.mjs';
import {
	availableSsrRuntimes,
	measureSsrArtifact,
	ssrEnvironmentMetadata
} from './ssr-run-environment.mjs';

/**
 * Measures each offered rate in fresh processes, with target-rate warmup and reversed case order.
 * Requires built workspace artifacts and verified loopback. Persists partial evidence on failure,
 * validates complete response identities, and closes every owned process before returning.
 */
export async function measureSsrArrivals(input, output, runtimeId = 'node') {
	const plan = validateSsrArrivalPlan(input);
	assert.ok(['node', 'bun'].includes(runtimeId), 'Expected node or bun');
	assertComparisonNetwork();
	const root = resolve(import.meta.dirname, '../..');
	const suite = resolve(root, 'framework-comparison');
	const renderMode = ssrRenderMode();
	const runtime = availableSsrRuntimes(runtimeId)[0];
	const transport = runtimeId === 'bun' ? 'bun-fetch' : 'node-http';
	const adapter = runtimeId === 'bun' ? 'bunAdapter' : 'nodeAdapter';
	const adapterPath = resolve(root, `framework-adapters/${runtimeId}-adapter/dist`);
	const artifacts = {};
	for (const id of ['exact', 'react']) {
		const path = resolve(
			suite,
			`participants/${id}/${runtimeId === 'bun' ? 'dist-bun-server/bun-server-entry.js' : 'dist-server/server-entry.js'}`
		);
		const bytes = await readFile(path);
		artifacts[id] = { path, bytes: bytes.length, sha256: hash(bytes) };
	}
	artifacts.server = await measureSsrArtifact(resolve(root, 'packages/server/dist'));
	artifacts[adapter] = await measureSsrArtifact(adapterPath);
	const report = {
		kind: 'independent-arrival-ssr',
		complete: false,
		runtimeId,
		renderMode,
		transports: { exact: transport, react: transport },
		createdAt: new Date().toISOString(),
		plan,
		artifacts,
		environment: ssrEnvironmentMetadata(availableSsrRuntimes('node,bun')),
		blocks: [],
		runner: await readFile(import.meta.filename, 'utf8')
	};
	await mkdir(dirname(output), { recursive: true });
	const save = () => writeFile(output, JSON.stringify(report));
	await save();
	const identities = new Map();
	let service, worker, timer, polling;
	let drivers = [];
	const lifecycle = installDevelopmentProcessLifecycle({
		label: 'Independent SSR arrivals',
		close
	});
	let primary;
	try {
		for (const entry of ssrArrivalCases(plan)) {
			await verifyEntries();
			await measureCase(entry);
			await close();
			await save();
		}
		await verifyEntries();
		assert.deepEqual(
			await measureSsrArtifact(resolve(root, 'packages/server/dist')),
			artifacts.server
		);
		assert.deepEqual(await measureSsrArtifact(adapterPath), artifacts[adapter]);
		report.complete = true;
		await save();
		return report;
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		try {
			await close();
		} catch (error) {
			if (!primary) throw error;
		} finally {
			lifecycle.dispose();
		}
	}

	/** Releases drivers first, then attempts both server closures even if one fails. */
	async function close() {
		clearInterval(timer);
		const ownedDrivers = drivers;
		drivers = [];
		const closed = await Promise.allSettled(ownedDrivers.map((driver) => driver.close()));
		await polling;
		const ownedWorker = worker,
			ownedService = service;
		worker = service = undefined;
		closed.push(
			...(await Promise.allSettled([
				...(ownedWorker ? [stopSsrWorker(ownedWorker)] : []),
				...(ownedService ? [ownedService.close()] : [])
			]))
		);
		const failures = closed.filter((result) => result.status === 'rejected');
		if (failures.length) throw new AggregateError(failures.map((result) => result.reason));
	}

	/** Rejects rebuilt participants instead of mixing code across rate cases. */
	async function verifyEntries() {
		for (const id of ['exact', 'react'])
			assert.equal(hash(await readFile(artifacts[id].path)), artifacts[id].sha256);
	}

	/** Owns one rate's complete warmup and measurement without inheriting another case's state. */
	async function measureCase({ population, id, rate, stages }) {
		const serviceIntervals = [],
			telemetry = [],
			telemetryErrors = [];
		service = await startSsrLoadProcess('service', {
			onInterval: (row) => serviceIntervals.push(row)
		});
		worker = await startSsrWorker({
			runtime,
			participantId: id,
			transport,
			workerPath: resolve(suite, 'src/ssr-benchmark-worker.mjs'),
			workingDirectory: suite,
			serviceUrl: service.url,
			environment: { COMPARISON_SSR_BOUNDED_TELEMETRY: '1' }
		});
		assert.equal(worker.renderMode, renderMode);
		const url = worker.url + '?__benchmarkPreloaded=true';
		const response = await fetch(url);
		assert.equal(response.status, 200);
		const body = Buffer.from(await response.arrayBuffer());
		assert.ok(body.toString().includes('Delayed fulfillment events'));
		const identity = { bytes: body.length, hash: hash(body) };
		if (identities.has(id)) assert.deepEqual(identity, identities.get(id));
		identities.set(id, identity);
		await controlSsrWorker(worker, 'reset');
		const snapshot = async () => ({
			epochMs: Date.now(),
			value: await controlSsrWorker(worker, 'telemetry')
		});
		telemetry.push(await snapshot());
		timer = setInterval(() => {
			if (polling) return;
			polling = snapshot()
				.then(
					(value) => telemetry.push(value),
					(error) => telemetryErrors.push(error.message)
				)
				.finally(() => {
					polling = undefined;
				});
		}, 1000);
		for (let index = 0; index < plan.drivers; index++)
			drivers.push(await startSsrLoadProcess('driver'));
		console.log(`Population ${population + 1}: ${id}, ${rate} offered RPS`);
		for (const driver of drivers)
			driver.run({
				url,
				contains: 'Delayed fulfillment events',
				expectedIdentity: identity,
				maxInFlight: 256,
				maxLagMs: 50,
				timeoutMs: 10000,
				stages
			});
		const results = await Promise.race([
			Promise.all(drivers.map((driver) => driver.result)),
			service.result
		]);
		for (const result of results)
			for (const stage of result.stages) {
				assert.equal(
					stage.offered,
					stage.started + stage.missedLag + stage.missedCapacity + stage.missedDeadline
				);
				assert.equal(stage.started, stage.completed);
				assert.equal(stage.completed, stage.valid + stage.errors);
				assert.equal(stage.invalid, 0);
			}
		clearInterval(timer);
		await polling;
		telemetry.push(await snapshot());
		assert.deepEqual(telemetryErrors, []);
		report.blocks.push({
			population,
			id,
			rate,
			workerPid: worker.child.pid,
			workerStderr: worker.stderr(),
			servicePid: service.pid,
			results,
			telemetry,
			telemetryErrors,
			serviceIntervals
		});
		console.log(
			JSON.stringify(
				results.map((result) =>
					result.stages.map((stage) => ({
						name: stage.name,
						rps: stage.validRps,
						p99: stage.distributions.responseMs.p99,
						errors: stage.errors,
						misses: stage.missedCapacity + stage.missedLag + stage.missedDeadline
					}))
				)
			)
		);
	}
}

function hash(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	const [planPath, output, runtimeId] = process.argv.slice(2);
	if (!planPath || !output)
		throw new Error('Usage: measure-ssr-arrivals.mjs <plan.json> <output.json> [node|bun]');
	await measureSsrArrivals(
		JSON.parse(await readFile(resolve(planPath), 'utf8')),
		resolve(output),
		runtimeId
	);
}
