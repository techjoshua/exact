import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { installDevelopmentProcessLifecycle } from '../../scripts/development-process-lifecycle.mjs';
import { balancedRoundOrder } from './balanced-round-order.mjs';
import {
	availableSsrRuntimes,
	ssrEnvironmentMetadata,
	measureSsrArtifact
} from './ssr-run-environment.mjs';
import { startSsrWorker, stopSsrWorker, controlSsrWorker } from './ssr-worker-controller.mjs';
import { settleSsrWorkerInventoryStartup } from './ssr-worker-inventory.mjs';
import { startSsrLoadProcess } from './ssr-load-process-owner.mjs';
import { validateSsrLoadPlan } from './ssr-load-plan.mjs';

/**
 * Measures production participants in counterbalanced sustained blocks with independently owned
 * driver and service processes. Does not build artifacts or publish into the short-window charts.
 * Paths in a plan are repository-relative; the CLI resolves the plan/output arguments from cwd.
 */
export async function measureSsrLoadComparison(config, output) {
	const repository = resolve(import.meta.dirname, '../..'),
		suite = resolve(repository, 'framework-comparison');
	const runtime = availableSsrRuntimes('node')[0];
	if (config.preloaded !== undefined && typeof config.preloaded !== 'boolean')
		throw new TypeError('preloaded must be a boolean');
	if (!Number.isSafeInteger(config.populations) || config.populations < 1 || config.populations > 8)
		throw new TypeError('populations must be in [1, 8]');
	if (
		!Array.isArray(config.participants) ||
		config.participants.length < 1 ||
		config.participants.length > 6
	)
		throw new TypeError('Expected 1–6 participants');
	const ids = new Set();
	for (const entry of config.participants) {
		if (
			typeof entry.id !== 'string' ||
			!entry.id ||
			ids.has(entry.id) ||
			!['exact', 'react'].includes(entry.participantId)
		)
			throw new TypeError('Expected uniquely named eXact/React participants');
		if (entry.serverEntry && entry.participantId !== 'exact')
			throw new TypeError('Only eXact accepts a frozen server entry override');
		ids.add(entry.id);
	}
	validateSsrLoadPlan({ ...config.driver, url: 'http://127.0.0.1/' });
	await mkdir(dirname(output), { recursive: true });
	const artifactPaths = Object.fromEntries(
		config.participants.map((entry) => [
			entry.id,
			resolve(
				repository,
				entry.serverEntry ??
					`framework-comparison/participants/${entry.participantId}/dist-server/server-entry.js`
			)
		])
	);
	const artifacts = await artifactIdentity();
	const report = {
		kind: 'independent-sustained-ssr-comparison-v1',
		createdAt: new Date().toISOString(),
		complete: false,
		config,
		environment: ssrEnvironmentMetadata([runtime]),
		topology:
			'one host; separate coordinator, controlled service, participant workers, and active load driver',
		artifacts,
		populations: []
	};
	let workers = [],
		service,
		driver,
		pollTimer,
		polling;
	const lifecycle = installDevelopmentProcessLifecycle({
		label: 'Sustained SSR comparison',
		close
	});
	try {
		for (let population = 0; population < config.populations; population++) {
			const rotated = balancedRoundOrder(config.participants, Math.floor(population / 2));
			const entries = (population % 2 ? rotated.reverse() : rotated).map((entry) => ({ ...entry }));
			const captured = {
				population,
				order: entries.map((entry) => entry.id),
				serviceIntervals: [],
				blocks: []
			};
			service = await startSsrLoadProcess('service', {
				onInterval: (row) => captured.serviceIntervals.push(row)
			});
			const startup = await settleSsrWorkerInventoryStartup(entries, (entry) =>
				startSsrWorker({
					runtime,
					participantId: entry.participantId,
					transport: 'node-http',
					workerPath: resolve(suite, 'src/ssr-benchmark-worker.mjs'),
					workingDirectory: suite,
					serviceUrl: service.url,
					environment: {
						COMPARISON_SSR_BOUNDED_TELEMETRY: '1',
						...(entry.participantId === 'exact'
							? { COMPARISON_EXACT_SERVER_ENTRY: artifactPaths[entry.id] }
							: {})
					}
				})
			);
			workers = startup.workers;
			if (startup.failure) throw startup.failure;
			for (const entry of entries) {
				console.log(`Population ${population + 1}/${config.populations}: ${entry.id}`);
				const telemetry = [],
					telemetryErrors = [];
				await controlSsrWorker(entry.worker, 'reset');
				telemetry.push({
					epochMs: Date.now(),
					value: await controlSsrWorker(entry.worker, 'telemetry')
				});
				pollTimer = setInterval(() => {
					if (polling) return;
					polling = controlSsrWorker(entry.worker, 'telemetry')
						.then(
							(value) => telemetry.push({ epochMs: Date.now(), value }),
							(error) => telemetryErrors.push({ epochMs: Date.now(), message: error.message })
						)
						.finally(() => {
							polling = undefined;
						});
				}, 1000);
				let lastProgress = 0;
				driver = await startSsrLoadProcess('driver', {
					onInterval: (row) => {
						if (Date.now() - lastProgress > 30_000 || row.final) {
							console.log(
								`${entry.id} ${row.stage}: ${(row.offsetMs / 1000).toFixed(0)}s, ${((row.valid / row.elapsedMs) * 1000).toFixed(0)} interval valid RPS, ${row.errors} errors, ${row.missedCapacity + row.missedLag + row.missedDeadline} missed arrivals`
							);
							lastProgress = Date.now();
						}
					}
				});
				driver.run({
					...config.driver,
					url: entry.worker.url + (config.preloaded ? '?__benchmarkPreloaded=true' : ''),
					contains: 'Delayed fulfillment events'
				});
				const measured = await Promise.race([driver.result, service.result]);
				await driver.close();
				driver = undefined;
				clearInterval(pollTimer);
				await polling;
				telemetry.push({
					epochMs: Date.now(),
					value: await controlSsrWorker(entry.worker, 'telemetry')
				});
				captured.blocks.push({
					id: entry.id,
					workerPid: entry.worker.child.pid,
					workerStderr: entry.worker.stderr(),
					servicePid: service.pid,
					measured,
					telemetry,
					telemetryErrors
				});
				report.populations = [
					...report.populations.filter((value) => value.population !== population),
					captured
				];
				await writeFile(output, JSON.stringify(report, null, 2) + '\n');
			}
			await close();
		}
		assert.deepEqual(await artifactIdentity(), artifacts);
		report.complete = true;
		await writeFile(output, JSON.stringify(report, null, 2) + '\n');
		return report;
	} finally {
		await close();
		lifecycle.dispose();
	}

	/** Captures immutable target files plus shared runtime/adapter dependencies outside timed blocks. */
	async function artifactIdentity() {
		const result = {};
		for (const [name, path] of Object.entries(artifactPaths)) {
			const bytes = await readFile(path);
			result[name] = {
				path,
				bytes: bytes.length,
				sha256: createHash('sha256').update(bytes).digest('hex')
			};
		}
		for (const [name, path] of Object.entries({
			server: 'packages/server/dist',
			nodeAdapter: 'framework-adapters/node-adapter/dist'
		}))
			result[name] = await measureSsrArtifact(resolve(repository, path));
		return result;
	}

	/** Releases active traffic before participants and service, including partial startup failures. */
	async function close() {
		clearInterval(pollTimer);
		const failures = [];
		if (driver) {
			const owned = driver;
			driver = undefined;
			try {
				await owned.close();
			} catch (error) {
				failures.push(error);
			}
		}
		await polling;
		const ownedWorkers = workers;
		workers = [];
		const stopped = await Promise.allSettled(ownedWorkers.map(stopSsrWorker));
		if (service) {
			const owned = service;
			service = undefined;
			try {
				await owned.close();
			} catch (error) {
				failures.push(error);
			}
		}
		const failed = stopped.find((value) => value.status === 'rejected');
		if (failed) failures.push(failed.reason);
		if (failures.length) throw new AggregateError(failures, 'Sustained-load cleanup failed');
	}
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	if (!process.argv[2] || !process.argv[3])
		throw new Error('Usage: node src/measure-ssr-load.mjs <plan.json> <output.json>');
	await measureSsrLoadComparison(
		JSON.parse(await readFile(resolve(process.argv[2]), 'utf8')),
		resolve(process.argv[3])
	);
}
