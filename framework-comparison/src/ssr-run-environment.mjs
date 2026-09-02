import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { cpus, platform, release, totalmem } from 'node:os';
import { extname, relative, resolve } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

/** Resolves the requested Node and Bun execution environments that are locally available. */
export function availableSsrRuntimes(requestedValue = process.env.COMPARISON_SSR_RUNTIMES) {
	const requested = (requestedValue ?? 'node,bun')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
	const result = [];
	for (const id of requested) {
		if (id === 'node') {
			result.push({
				id,
				command: process.execPath,
				arguments: ['--expose-gc'],
				version: process.version
			});
			continue;
		}
		if (id === 'bun') {
			const probe = spawnSync(process.env.BUN ?? 'bun', ['--version'], {
				encoding: 'utf8',
				windowsHide: true
			});
			if (probe.status === 0)
				result.push({
					id,
					command: process.env.BUN ?? 'bun',
					arguments: [],
					version: probe.stdout.trim()
				});
			continue;
		}
		throw new Error(`Unknown SSR runtime ${id}`);
	}
	if (!result.length) throw new Error('No requested SSR benchmark runtime is available');
	return result;
}

/**
 * Keeps Bun's Windows upstream population within its reusable per-origin connection capacity.
 * Explicit operator configuration remains authoritative for controlled experiments.
 */
export function ssrWorkerNetworkEnvironment(
	runtimeId,
	hostPlatform = process.platform,
	configuredLimit = process.env.BUN_CONFIG_MAX_HTTP_REQUESTS
) {
	if (runtimeId !== 'bun' || hostPlatform !== 'win32') return {};
	return { BUN_CONFIG_MAX_HTTP_REQUESTS: configuredLimit ?? '64' };
}

/** Measures the complete non-source-map server artifact without mutating its output directory. */
export async function measureSsrArtifact(directory) {
	const files = await allFiles(directory);
	let rawBytes = 0;
	let gzipBytes = 0;
	let brotliBytes = 0;
	const hash = createHash('sha256');
	for (const file of files) {
		const bytes = await readFile(file);
		hash.update(relative(directory, file).replaceAll('\\', '/'));
		hash.update('\0');
		hash.update(bytes);
		hash.update('\0');
		rawBytes += bytes.length;
		gzipBytes += gzipSync(bytes).length;
		brotliBytes += brotliCompressSync(bytes).length;
	}
	return { rawBytes, gzipBytes, brotliBytes, files: files.length, hash: hash.digest('hex') };
}

/** Captures host and runtime identity required to interpret a local comparison run. */
export function ssrEnvironmentMetadata(runtimeList) {
	const cpu = cpus()[0];
	return {
		platform: platform(),
		platformRelease: release(),
		cpu: cpu ? { model: cpu.model, logicalCount: cpus().length } : null,
		totalMemoryBytes: totalmem(),
		runtimes: Object.fromEntries(runtimeList.map((runtime) => [runtime.id, runtime.version])),
		workerNetworkEnvironment: Object.fromEntries(
			runtimeList.map((runtime) => [runtime.id, ssrWorkerNetworkEnvironment(runtime.id)])
		)
	};
}

async function allFiles(directory) {
	const result = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory()) result.push(...(await allFiles(file)));
		else if ((await stat(file)).isFile() && extname(file) !== '.map') result.push(file);
	}
	return result.sort();
}
