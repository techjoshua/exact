import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execute = promisify(execFile);

test('publishes reconciled heap categories from source-only evidence and rejects incomplete totals', async () => {
	const root = await mkdtemp(join(tmpdir(), 'exact-heap-report-'));
	try {
		const input = join(root, 'input.json');
		const output = join(root, 'output.json');
		const run = {
			schemaVersion: 1,
			kind: 'framework-comparison-heap-composition',
			correctness: { status: 'passed' },
			createdAt: '2026-09-06T00:00:00Z',
			commit: 'fixture',
			browserVersion: 'fixture',
			sampleCount: 1,
			participants: [
				{
					name: 'Fixture',
					artifactHash: 'fixture',
					samples: [{ composition: { selfBytes: 30, selfBytesByType: { code: 10, object: 20 } } }]
				}
			]
		};
		await writeFile(input, JSON.stringify(run));
		const script = resolve('scripts/component-local-target-abi/publish-docs-heap-report.mjs');
		await execute(process.execPath, [script, input, output]);
		const report = JSON.parse(await readFile(output, 'utf8'));
		assert.equal(report.series[0].values[0], 10 / 1e6);
		assert.equal(report.totals[0], 30 / 1e6);
		run.participants[0].samples[0].composition.selfBytes++;
		await writeFile(input, JSON.stringify(run));
		await assert.rejects(execute(process.execPath, [script, input, output]), /reconcile/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
