import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const execute = promisify(execFile);
const script = resolve('scripts/component-local-target-abi/publish-docs-performance-report.mjs');

test('publishes only complete compact distributions with arithmetic means', async () => {
	const root = await mkdtemp(join(tmpdir(), 'exact-docs-performance-'));
	try {
		const input = join(root, 'input.json');
		const output = join(root, 'output.json');
		const stats = { mean: 2, p50: 1, p75: 2, p95: 3, p99: 4 };
		await writeFile(
			input,
			JSON.stringify({
				schemaVersion: 1,
				metadata: {
					commit: 'fixture',
					createdAt: '2026-09-04T00:00:00.000Z',
					browserSamples: 50,
					startupSamples: 50,
					ssrSamples: 50
				},
				browserCharts: [
					{
						title: 'Fixture',
						unit: 'ms',
						comment: 'Lower is better.',
						series: [{ name: 'Exact', stats }]
					}
				]
			})
		);
		await execute(process.execPath, [script, input, output]);
		assert.equal(
			JSON.parse(await readFile(output, 'utf8')).browserCharts[0].series[0].stats.mean,
			2
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('rejects a percentile-only summary', async () => {
	const root = await mkdtemp(join(tmpdir(), 'exact-docs-performance-invalid-'));
	try {
		const input = join(root, 'input.json');
		await writeFile(
			input,
			JSON.stringify({
				schemaVersion: 1,
				metadata: {
					commit: 'fixture',
					createdAt: 'now',
					browserSamples: 1,
					startupSamples: 1,
					ssrSamples: 1
				},
				browserCharts: [
					{
						title: 'Fixture',
						unit: 'ms',
						comment: 'No mean.',
						series: [{ name: 'Exact', stats: { p50: 1, p75: 2, p95: 3, p99: 4 } }]
					}
				]
			})
		);
		await assert.rejects(
			execute(process.execPath, [script, input, join(root, 'output.json')]),
			/finite mean/
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
