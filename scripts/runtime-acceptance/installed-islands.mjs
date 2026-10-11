import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

/** Requires fresh successful installed-package journeys before recording native-host evidence. */
export async function checkInstalledIslands(root, reportFile) {
	await rm(reportFile, { force: true });
	const result = await promisify(execFile)(
		process.execPath,
		[
			path.join(root, 'node_modules/vitest/vitest.mjs'),
			'run',
			'framework-adapters/vite-plugin/src/installed-islands-native.integration.test.ts',
			'framework-adapters/vite-plugin/src/installed-islands-browser.integration.test.ts',
			'--reporter=default',
			'--reporter=json',
			'--outputFile.json=' + reportFile
		],
		{
			cwd: root,
			env: { ...process.env, EXACT_NATIVE_RUNTIME_ACCEPTANCE: '1' },
			maxBuffer: 8 * 1024 * 1024
		}
	);
	process.stdout.write(result.stdout);
	process.stderr.write(result.stderr);
	const report = JSON.parse(await readFile(reportFile, 'utf8'));
	assert.equal(report.success, true);
	assert.equal(report.numPassedTests, 8);
	const assertions = report.testResults.flatMap((file) => file.assertionResults);
	assert.equal(assertions.length, 8);
	const executions = ['bun', 'deno', 'cloudflare'].map((runtime) => {
		const tests = [false, true].map(
			(stream) => `retains installed islands on ${runtime}, streaming=${stream}`
		);
		for (const title of tests) {
			const matches = assertions.filter((test) => test.title === title);
			assert.equal(matches.length, 1, title);
			assert.equal(matches[0].status, 'passed', title);
		}
		return { id: 'native-installed-' + runtime, tests, status: 'verified' };
	});
	const tests = [false, true].map(
		(stream) => `retains installed owners in Chromium, streaming=${stream}`
	);
	for (const title of tests) {
		const matches = assertions.filter((test) => test.title === title);
		assert.equal(matches.length, 1, title);
		assert.equal(matches[0].status, 'passed', title);
	}
	return [...executions, { id: 'installed-browser-chromium', tests, status: 'verified' }];
}
