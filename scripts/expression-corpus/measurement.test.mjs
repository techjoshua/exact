import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	appendExpressionCorpusHistory,
	batchExpressionCorpusGroups,
	expressionCorpusRunRecord,
	expressionCorpusTrend,
	positiveInteger,
	writeExpressionCorpusBaseline
} from './measurement.mjs';

const temporaryDirectories = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe('expression corpus measurement policy', () => {
	it('bounds worker batches without changing project or file order', () => {
		expect(
			batchExpressionCorpusGroups(
				[
					['a.json', ['a', 'b', 'c']],
					['b.json', ['d']]
				],
				2
			)
		).toEqual([
			['a.json', ['a', 'b']],
			['a.json', ['c']],
			['b.json', ['d']]
		]);
	});

	it('rejects invalid resource policy overrides', () => {
		expect(positiveInteger(undefined, 10, 'batch size')).toBe(10);
		expect(positiveInteger('20', 10, 'batch size')).toBe(20);
		expect(() => positiveInteger('0', 10, 'batch size')).toThrow('positive integer');
		expect(() => positiveInteger('1.5', 10, 'batch size')).toThrow('positive integer');
	});

	it('calculates comparable baseline trends', () => {
		const record = expressionCorpusRunRecord({
			status: 'passed',
			elapsedMs: 120,
			workers: 2,
			workerHeapMb: 4_096,
			batchSize: 16,
			fileCount: 4,
			projectCount: 1,
			batchCount: 1,
			peakWorkerRssMb: 384,
			baseline: { elapsedMs: 100, workers: 2, workerHeapMb: 4_096, batchSize: 16 }
		});
		expect(record.baselineRatio).toBe(1.2);
		expect(record.peakWorkerRssMb).toBe(384);
		expect(expressionCorpusTrend(record)).toBe('20.0% slower than baseline');
	});

	it('retains bounded local history and writes only successful baselines', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-expression-measurement-'));
		temporaryDirectories.push(root);
		const record = expressionCorpusRunRecord({
			status: 'passed',
			elapsedMs: 100,
			workers: 1,
			workerHeapMb: 4_096,
			batchSize: 16,
			fileCount: 1,
			projectCount: 1,
			batchCount: 1,
			peakWorkerRssMb: 256
		});
		for (let index = 0; index < 55; index++)
			await appendExpressionCorpusHistory(root, { ...record, elapsedMs: index });
		const history = JSON.parse(
			await readFile(path.join(root, '.tmp/expression-corpus-history.json'), 'utf8')
		);
		expect(history.runs).toHaveLength(50);
		expect(history.runs[0].elapsedMs).toBe(5);

		await writeExpressionCorpusBaseline(root, record);
		const baseline = JSON.parse(
			await readFile(path.join(root, 'docs/performance-baselines/expression-corpus.json'), 'utf8')
		);
		expect(baseline.elapsedMs).toBe(100);
		await expect(
			writeExpressionCorpusBaseline(root, { ...record, status: 'failed' })
		).rejects.toThrow('failed run');
	});
});
