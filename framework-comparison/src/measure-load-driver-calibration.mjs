import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { withAcceptanceServer } from '../../scripts/acceptance-process.mjs';
import { installDevelopmentProcessLifecycle } from '../../scripts/development-process-lifecycle.mjs';
import { assertComparisonNetwork } from './network-environment.mjs';
import { startSsrLoadProcess } from './ssr-load-process-owner.mjs';

const network = assertComparisonNetwork();
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const report = {
	kind: 'load-driver-calibration-v1',
	createdAt: new Date().toISOString(),
	complete: false,
	source: {
		commit: git(['rev-parse', 'HEAD']),
		workingTreeDirty: Boolean(git(['status', '--porcelain', '--untracked-files=normal']))
	},
	environment: { network, cpu: cpus()[0].model, platform: process.platform, node: process.version },
	method:
		'Fresh Node static server and driver per case. Two populations reverse driver and endpoint order. Two-second discarded warmup, five-second concurrency-64 capacity, five-second 10,000/s scheduled demand. No framework rendering. Server CPU includes warmup and both stages.',
	blocks: []
};
let driver;
const lifecycle = installDevelopmentProcessLifecycle({
	label: 'Load driver calibration',
	close: async () => {
		await driver?.close();
	}
});
try {
	for (const population of [0, 1]) {
		const endpoints = population
			? ['chunked', 'payload', 'minimal']
			: ['minimal', 'payload', 'chunked'];
		const implementations = population ? ['rust', 'node'] : ['node', 'rust'];
		for (const endpoint of endpoints)
			for (const implementation of implementations) {
				await withAcceptanceServer(
					root,
					async (origin) => {
						const metrics = async () => {
							const response = await fetch(origin + 'metrics');
							return response.json();
						};
						const before = await metrics();
						driver = await startSsrLoadProcess('driver', { implementation });
						try {
							driver.run({
								url: origin + endpoint,
								maxInFlight: 256,
								maxLagMs: 50,
								stages: [
									{
										name: 'warmup',
										mode: 'concurrency',
										concurrency: 64,
										durationMs: 2000,
										discard: true
									},
									{ name: 'capacity', mode: 'concurrency', concurrency: 64, durationMs: 5000 },
									{ name: 'arrivals', mode: 'arrival', rate: 10000, durationMs: 5000 }
								]
							});
							const result = await driver.result;
							const after = await metrics();
							report.blocks.push({
								population,
								endpoint,
								implementation,
								result,
								server: {
									elapsedMs: after.elapsedMs - before.elapsedMs,
									cpuMs: after.cpuMs - before.cpuMs,
									cpuPercentOfOneCore:
										(100 * (after.cpuMs - before.cpuMs)) / (after.elapsedMs - before.elapsedMs),
									requests: after.requests - before.requests
								}
							});
							await writeFile(process.argv[2], JSON.stringify(report) + '\n');
							console.log(`Completed ${population + 1}: ${endpoint}, ${implementation}`);
						} finally {
							await driver.close();
							driver = undefined;
						}
					},
					{ entry: 'framework-comparison/src/load-driver-calibration-server.mjs' }
				);
			}
	}
	report.complete = true;
	await writeFile(process.argv[2], JSON.stringify(report) + '\n');
} finally {
	await driver?.close();
	lifecycle.dispose();
}
