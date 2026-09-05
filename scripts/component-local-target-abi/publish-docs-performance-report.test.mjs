import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const execute = promisify(execFile);
const script = resolve('scripts/component-local-target-abi/publish-docs-performance-report.mjs');

test('publishes complete current distributions without internal before comparisons', async () => {
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
						title: 'Navigation completion',
						unit: 'ms',
						comment:
							'Exact improves against its normalized history. Exact is currently the fastest.',
						series: [
							{ name: 'Exact before - normalized', before: true, stats },
							{ name: 'Exact', stats }
						]
					},
					{
						title: 'JavaScript evaluation - 1x CPU',
						unit: 'ms',
						comment: 'Internal attribution.',
						series: [{ name: 'Exact', stats }]
					}
				],
				diagnostics: { preloaded: { title: 'Internal lane' } },
				clientFootprint: [
					{
						title: 'Bytes',
						unit: 'B',
						comment: 'Lower is better.',
						values: [
							{ name: 'Exact before', before: true, value: 3 },
							{ name: 'Exact', value: 2 }
						]
					}
				]
			})
		);
		await execute(process.execPath, [script, input, output]);
		const published = JSON.parse(await readFile(output, 'utf8'));
		assert.deepEqual(
			published.browserCharts[0].series.map((series) => series.name),
			['Exact']
		);
		assert.equal(JSON.stringify(published).includes('before'), false);
		assert.equal('clientFootprint' in published, false);
		assert.equal('diagnostics' in published, false);
		assert.equal(published.browserCharts.length, 1);
		assert.equal(published.browserCharts[0].series[0].stats.mean, 2);
		assert.equal(published.browserCharts[0].comment, 'Exact is currently the fastest.');
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
						title: 'Navigation completion',
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
