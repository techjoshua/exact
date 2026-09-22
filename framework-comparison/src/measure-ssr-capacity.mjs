import { assertComparisonNetwork } from './network-environment.mjs';
import { ssrRenderMode } from './ssr-render-mode.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installDevelopmentProcessLifecycle } from '../../scripts/development-process-lifecycle.mjs';
import { startSsrLoadProcess } from './ssr-load-process-owner.mjs';
import { startSsrWorker, stopSsrWorker, controlSsrWorker } from './ssr-worker-controller.mjs';
import {
	availableSsrRuntimes,
	measureSsrArtifact,
	ssrEnvironmentMetadata
} from './ssr-run-environment.mjs';
const plan = JSON.parse(await readFile(process.argv[2], 'utf8')),
	output = process.argv[3];
const renderMode = ssrRenderMode();
assertComparisonNetwork();
if (
	typeof plan.preloaded !== 'boolean' ||
	!Number.isSafeInteger(plan.drivers) ||
	plan.drivers < 1 ||
	plan.drivers > 8
)
	throw new TypeError('Capacity plan requires explicit preloaded and 1–8 drivers');
const runtimeId = process.argv[4];
if (!['node', 'bun'].includes(runtimeId)) throw Error('Invalid runtime');
const runtimes = availableSsrRuntimes('node,bun');
const artifacts = {};
const identities = {};
for (const id of ['exact', 'react']) {
	const path = resolve(
		`framework-comparison/participants/${id}/${runtimeId === 'bun' ? 'dist-bun-server/bun-server-entry.js' : 'dist-server/server-entry.js'}`
	);
	const bytes = await readFile(path);
	artifacts[id] = {
		path,
		bytes: bytes.length,
		sha256: createHash('sha256').update(bytes).digest('hex')
	};
}
artifacts.server = await measureSsrArtifact(resolve('packages/server/dist'));
artifacts[runtimeId === 'bun' ? 'bunAdapter' : 'nodeAdapter'] = await measureSsrArtifact(
	resolve(`framework-adapters/${runtimeId === 'bun' ? 'bun' : 'node'}-adapter/dist`)
);
const prior = { artifacts, environment: ssrEnvironmentMetadata(runtimes) };
const report = {
	kind: 'multi-driver-preloaded-ssr',
	complete: false,
	runtimeId,
	renderMode,
	transports: {
		exact: runtimeId === 'bun' ? 'bun-fetch' : 'node-http',
		react: runtimeId === 'bun' ? 'bun-fetch' : 'node-http'
	},
	createdAt: new Date().toISOString(),
	plan,
	artifacts: prior.artifacts,
	environment: prior.environment,
	blocks: []
};
report.telemetryControl = {
	transport: 'persistent-http',
	source: 'framework-comparison/src/ssr-worker-controller.mjs',
	sha256: createHash('sha256')
		.update(await readFile(resolve('framework-comparison/src/ssr-worker-controller.mjs')))
		.digest('hex')
};
const runtime = availableSsrRuntimes(runtimeId)[0];
let service,
	worker,
	drivers = [],
	timer,
	polling;
async function close() {
	clearInterval(timer);
	const ds = drivers;
	drivers = [];
	const closed = await Promise.allSettled(ds.map((d) => d.close()));
	await polling;
	if (worker) {
		const w = worker;
		worker = undefined;
		await stopSsrWorker(w);
	}
	if (service) {
		const s = service;
		service = undefined;
		await s.close();
	}
	const failures = closed.filter((x) => x.status === 'rejected');
	if (failures.length) throw new AggregateError(failures.map((x) => x.reason));
}
async function verify() {
	for (const id of ['exact', 'react']) {
		const a = report.artifacts[id];
		assert.equal(
			createHash('sha256')
				.update(await readFile(a.path))
				.digest('hex'),
			a.sha256
		);
	}
}
const lifecycle = installDevelopmentProcessLifecycle({
	label: 'Multi-driver preloaded SSR',
	close
});
try {
	await verify();
	for (let population = 0; population < 2; population++)
		for (const id of population ? ['react', 'exact'] : ['exact', 'react']) {
			const serviceIntervals = [],
				telemetry = [],
				telemetryErrors = [];
			service = await startSsrLoadProcess('service', {
				onInterval: (r) => serviceIntervals.push(r)
			});
			worker = await startSsrWorker({
				runtime,
				participantId: id,
				transport: runtimeId === 'bun' ? 'bun-fetch' : 'node-http',
				workerPath: resolve('framework-comparison/src/ssr-benchmark-worker.mjs'),
				workingDirectory: resolve('framework-comparison'),
				serviceUrl: service.url,
				environment: {
					COMPARISON_SSR_BOUNDED_TELEMETRY: '1',
					...(id === 'exact' ? { COMPARISON_EXACT_SERVER_ENTRY: report.artifacts.exact.path } : {})
				}
			});
			assert.equal(worker.renderMode, renderMode);
			const response = await fetch(
				worker.url + (plan.preloaded === false ? '' : '?__benchmarkPreloaded=true')
			);
			assert.equal(response.status, 200);
			const body = Buffer.from(await response.arrayBuffer());
			assert.ok(body.toString().includes('Delayed fulfillment events'));
			identities[id] = {
				bytes: body.length,
				hash: createHash('sha256').update(body).digest('hex')
			};
			await controlSsrWorker(worker, 'reset');
			telemetry.push({ epochMs: Date.now(), value: await controlSsrWorker(worker, 'telemetry') });
			timer = setInterval(() => {
				if (polling) return;
				polling = controlSsrWorker(worker, 'telemetry')
					.then(
						(value) => telemetry.push({ epochMs: Date.now(), value }),
						(e) => telemetryErrors.push(e.message)
					)
					.finally(() => {
						polling = undefined;
					});
			}, 1000);
			for (let i = 0; i < plan.drivers; i++) drivers.push(await startSsrLoadProcess('driver'));
			console.log('Population', population + 1, id, 'drivers', drivers.length);
			for (const d of drivers)
				d.run({
					url: worker.url + (plan.preloaded === false ? '' : '?__benchmarkPreloaded=true'),
					contains: 'Delayed fulfillment events',
					expectedIdentity: identities[id],
					maxInFlight: 256,
					maxLagMs: 50,
					timeoutMs: 10000,
					stages: plan.stages
				});
			const results = await Promise.race([
				Promise.all(drivers.map((d) => d.result)),
				service.result
			]);
			for (const r of results)
				for (const s of r.stages) {
					assert.equal(s.offered, s.started + s.missedLag + s.missedCapacity + s.missedDeadline);
					assert.equal(s.completed, s.valid + s.errors);
					assert.equal(s.started, s.completed);
				}
			clearInterval(timer);
			await polling;
			telemetry.push({ epochMs: Date.now(), value: await controlSsrWorker(worker, 'telemetry') });
			const block = {
				population,
				id,
				workerPid: worker.child.pid,
				workerStderr: worker.stderr(),
				servicePid: service.pid,
				results,
				telemetry,
				telemetryErrors,
				serviceIntervals
			};
			report.blocks.push(block);
			for (let i = 0; i < plan.stages.length; i++) {
				const ss = results.map((r) => r.stages[i]);
				console.log(
					ss[0].name,
					JSON.stringify({
						rps: ss.reduce((n, s) => n + s.validRps, 0),
						errors: ss.reduce((n, s) => n + s.errors, 0),
						misses: ss.reduce((n, s) => n + s.missedCapacity + s.missedLag + s.missedDeadline, 0)
					})
				);
			}
			await close();
			await writeFile(output, JSON.stringify(report));
		}
	await verify();
	assert.deepEqual(await measureSsrArtifact(resolve('packages/server/dist')), artifacts.server);
	assert.deepEqual(
		await measureSsrArtifact(
			resolve(`framework-adapters/${runtimeId === 'bun' ? 'bun' : 'node'}-adapter/dist`)
		),
		artifacts[runtimeId === 'bun' ? 'bunAdapter' : 'nodeAdapter']
	);
	report.complete = true;
	await writeFile(output, JSON.stringify(report));
} finally {
	await close();
	lifecycle.dispose();
}
