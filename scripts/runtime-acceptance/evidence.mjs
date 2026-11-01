import assert from 'node:assert/strict';
import { captureFrameworkSources } from '../framework-confidence/source-snapshot.mjs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

/** Starts one acceptance record with the exact source revision, worktree limit, and host selection. */
export async function createRuntimeAcceptanceEvidence(root) {
	return {
		version: 1,
		sourceFingerprint: await captureFrameworkSources(root),
		runToken: process.env.EXACT_ACCEPTANCE_RUN_TOKEN ?? randomUUID(),
		started: new Date().toISOString(),
		revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
		dirty:
			execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '',
		node: process.version,
		browser: process.env.EXACT_ACCEPTANCE_BROWSER ?? 'chromium',
		executions: []
	};
}

/** Rejects success evidence assembled from different source, fixture or configuration versions. */
export async function verifyRuntimeAcceptanceSources(root, evidence) {
	assert.deepEqual(
		await captureFrameworkSources(root),
		evidence.sourceFingerprint,
		'Source, fixtures or configuration changed during native acceptance'
	);
}
